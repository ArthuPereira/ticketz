import asyncio
import base64
from datetime import datetime, timezone
from decimal import Decimal
import json
import logging
from typing import Any, Optional
import uuid
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from fastapi import HTTPException, status

from src.core.aws import get_dynamodb_client, get_dynamodb_resource
from src.core.settings import settings

logger = logging.getLogger("ticketz.action_log")

SENSITIVE_KEYS = {"senha", "senha_hash", "password", "token", "secret", "access_token"}


def sanitize_data(data: Any) -> Any:
    """Remove chaves sensíveis como senhas e tokens de forma recursiva."""
    if isinstance(data, dict):
        return {
            k: sanitize_data(v)
            for k, v in data.items()
            if k.lower() not in SENSITIVE_KEYS
        }
    if isinstance(data, list):
        return [sanitize_data(x) for x in data]
    return data


def to_dynamodb_friendly(data: Any) -> Any:
    """Converte estruturas Python em formatos compatíveis com DynamoDB (floats para Decimal, datetimes para ISO)."""
    if data is None:
        return None
    clean = sanitize_data(data)
    # json.dumps com default=str converte datetimes, UUIDs, etc.
    # parse_float=Decimal converte qualquer float em Decimal
    return json.loads(json.dumps(clean, default=str), parse_float=Decimal)


def from_dynamodb_friendly(item: Any) -> Any:
    """Converte tipos do DynamoDB (como Decimal) para tipos nativos do Python/JSON."""
    if isinstance(item, list):
        return [from_dynamodb_friendly(v) for v in item]
    if isinstance(item, dict):
        return {k: from_dynamodb_friendly(v) for k, v in item.items()}
    if isinstance(item, Decimal):
        return int(item) if item % 1 == 0 else float(item)
    return item


async def registrar_log(
    entidade: str,
    acao: str,
    usuario_id: Optional[int] = None,
    dados: Optional[dict[str, Any]] = None,
) -> None:
    """Registra uma ação de auditoria no DynamoDB.
    Nunca propaga exceções para não derrubar a requisição do usuário."""
    try:
        agora = datetime.now(timezone.utc)
        sk = f"{agora.isoformat()}#{uuid.uuid4().hex[:8]}"

        item: dict[str, Any] = {
            "entidade": entidade,
            "sk": sk,
            "acao": acao,
            "timestamp": agora.isoformat(),
        }

        if usuario_id is not None:
            item["usuario_id"] = usuario_id

        if dados is not None:
            item["dados"] = to_dynamodb_friendly(dados)

        def _put():
            dynamodb = get_dynamodb_resource()
            table = dynamodb.Table(settings.DYNAMODB_TABLE)
            table.put_item(Item=item)

        await asyncio.to_thread(_put)
    except Exception as e:
        logger.error(
            "Falha ao registrar log no DynamoDB (entidade=%s, acao=%s): %s",
            entidade,
            acao,
            e,
        )


async def consultar_logs_evento(
    evento_id: int,
    limit: int = 20,
    cursor: Optional[str] = None,
) -> dict[str, Any]:
    """Consulta o histórico de logs de um evento ordenado do mais recente para o mais antigo.
    Suporta paginação via cursor (LastEvaluatedKey em base64)."""
    query_kwargs: dict[str, Any] = {
        "KeyConditionExpression": Key("entidade").eq(f"evento#{evento_id}"),
        "ScanIndexForward": False,
        "Limit": limit,
    }

    if cursor:
        try:
            raw_key_json = base64.urlsafe_b64decode(cursor.encode()).decode()
            query_kwargs["ExclusiveStartKey"] = json.loads(
                raw_key_json, parse_float=Decimal
            )
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cursor de paginação inválido",
            )

    def _query():
        dynamodb = get_dynamodb_resource()
        table = dynamodb.Table(settings.DYNAMODB_TABLE)
        return table.query(**query_kwargs)

    try:
        response = await asyncio.to_thread(_query)
    except ClientError as e:
        logger.error("Erro ao consultar logs no DynamoDB para evento %s: %s", evento_id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erro ao consultar logs de auditoria",
        )

    raw_items = response.get("Items", [])
    items = [from_dynamodb_friendly(item) for item in raw_items]

    next_cursor = None
    last_evaluated_key = response.get("LastEvaluatedKey")
    if last_evaluated_key:
        encoded = base64.urlsafe_b64encode(
            json.dumps(from_dynamodb_friendly(last_evaluated_key)).encode()
        ).decode()
        next_cursor = encoded

    return {
        "items": items,
        "cursor": next_cursor,
    }


async def check_dynamodb_ready() -> bool:
    """Verifica se a tabela do DynamoDB está acessível e ativa."""
    def _describe():
        client = get_dynamodb_client()
        res = client.describe_table(TableName=settings.DYNAMODB_TABLE)
        return res.get("Table", {}).get("TableStatus") in ("ACTIVE", "UPDATING")

    try:
        return await asyncio.to_thread(_describe)
    except Exception as e:
        logger.warning("DynamoDB health check falhou: %s", e)
        return False
