import asyncio
from datetime import datetime, timezone
import json
import logging
from typing import Optional
from sqlalchemy import select, update
from sqlalchemy.orm import joinedload

from src.core.action_log import registrar_log
from src.core.database import AsyncSessionLocal
from src.core.models import Ingresso, StatusIngresso
from src.core.s3 import put_ticket_pdf
from src.core.settings import settings
from worker.pdf import DadosIngressoPDF, gerar_pdf

logger = logging.getLogger("ticketz.worker.handler")

_worker_session_maker = AsyncSessionLocal


def get_worker_session_maker():
    return _worker_session_maker


def set_worker_session_maker(maker):
    global _worker_session_maker
    _worker_session_maker = maker


class ErroPermanente(Exception):
    """Erro irrecuperável que não deve ser retentado (mensagem malformada ou ingresso inexistente)."""
    pass


def extrair_id(body: str) -> int:
    """Extrai o ingresso_id da mensagem SQS com suporte a formato direto e envelope SNS (Notification)."""
    try:
        data = json.loads(body)
    except Exception as e:
        raise ErroPermanente(f"Corpo não é um JSON válido: {body}") from e

    if isinstance(data, dict):
        # Suporte ao envelope SNS caso raw_message_delivery esteja desligado
        if data.get("Type") == "Notification" and "Message" in data:
            try:
                inner = json.loads(data["Message"])
                if isinstance(inner, dict) and "ingresso_id" in inner:
                    return int(inner["ingresso_id"])
            except Exception as e:
                raise ErroPermanente(f"Falha ao decodificar envelope SNS: {data['Message']}") from e

        if "ingresso_id" in data:
            try:
                return int(data["ingresso_id"])
            except (ValueError, TypeError) as e:
                raise ErroPermanente(f"ingresso_id inválido: {data['ingresso_id']}") from e

    raise ErroPermanente(f"Mensagem sem ingresso_id: {body}")


def extrair_id_seguro(body: str) -> Optional[int]:
    """Tenta extrair o ingresso_id de forma segura para marcação de falha."""
    try:
        return extrair_id(body)
    except Exception:
        return None


async def carregar_dados_ingresso(ingresso_id: int):
    """Carrega o ingresso com as relações evento e usuario via JOIN."""
    session_maker = get_worker_session_maker()
    async with session_maker() as session:
        stmt = (
            select(Ingresso)
            .options(joinedload(Ingresso.evento), joinedload(Ingresso.usuario))
            .where(Ingresso.id == ingresso_id)
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()


async def marcar_ready(ingresso_id: int, key: str) -> bool:
    """Marca o ingresso como READY de forma atômica e idempotente.
    Retorna True se houve atualização (status <> 'READY')."""
    agora = datetime.now(timezone.utc)
    session_maker = get_worker_session_maker()
    async with session_maker() as session:
        stmt = (
            update(Ingresso)
            .where(Ingresso.id == ingresso_id, Ingresso.status != StatusIngresso.READY)
            .values(
                status=StatusIngresso.READY,
                pdf_key=key,
                pronto_em=agora,
            )
            .returning(Ingresso.id)
        )
        res = await session.execute(stmt)
        await session.commit()
        return res.first() is not None


async def marcar_failed(ingresso_id: Optional[int]) -> bool:
    """Marca o ingresso como FAILED caso ainda esteja em PENDING (não sobrescreve se já ficou READY)."""
    if ingresso_id is None:
        return False

    session_maker = get_worker_session_maker()
    async with session_maker() as session:
        stmt = (
            update(Ingresso)
            .where(Ingresso.id == ingresso_id, Ingresso.status == StatusIngresso.PENDING)
            .values(
                status=StatusIngresso.FAILED,
            )
            .returning(Ingresso.id)
        )
        res = await session.execute(stmt)
        await session.commit()
        alterado = res.first() is not None

    if alterado:
        await registrar_log(
            entidade=f"ingresso#{ingresso_id}",
            acao="TICKET_FAILED",
            usuario_id=None,
            dados={"motivo": "Excedido maxReceiveCount"},
        )
    return alterado


async def processar(ingresso_id: int) -> None:
    """Lógica central de processamento de um ingresso:
    1. Carrega dados do banco (ingresso + evento + usuário).
    2. Verifica idempotência (se READY, retorna imediatamente).
    3. Simula delay configurável (WORKER_DELAY_SECONDS) se definido.
    4. Gera PDF com QR Code em memória.
    5. Faz upload para o bucket S3 em chave determinística.
    6. Atualiza status no banco para READY de forma idempotente.
    7. Registra log TICKET_READY no DynamoDB."""
    # 1. Carrega ingresso + evento + usuário
    ingresso = await carregar_dados_ingresso(ingresso_id)
    if ingresso is None:
        raise ErroPermanente(f"Ingresso #{ingresso_id} não existe no banco de dados.")

    # 2. Idempotência: se já estiver READY, não reprocessa
    if ingresso.status == StatusIngresso.READY:
        logger.info("Ingresso #%s já está READY. Pulando geração de PDF.", ingresso_id)
        return

    # 3. Delay artificial para demonstração visual de desacoplamento
    if settings.WORKER_DELAY_SECONDS > 0:
        await asyncio.sleep(settings.WORKER_DELAY_SECONDS)

    # 4. Gera PDF com QR Code (execução fora do event loop)
    dados_pdf = DadosIngressoPDF(
        ingresso_id=ingresso.id,
        codigo=str(ingresso.codigo),
        evento_nome=ingresso.evento.nome,
        evento_data=ingresso.evento.data,
        evento_local=ingresso.evento.local,
        usuario_nome=ingresso.usuario.nome,
        usuario_email=ingresso.usuario.email,
    )
    pdf_bytes = await asyncio.to_thread(gerar_pdf, dados_pdf)

    # 5. Upload para o S3 com chave determinística
    key = f"eventos/{ingresso.evento_id}/ingressos/{ingresso.id}.pdf"
    await asyncio.to_thread(put_ticket_pdf, key, pdf_bytes)

    # 6. Atualiza no RDS para READY (idempotência no banco)
    atualizou = await marcar_ready(ingresso.id, key)

    # 7. Registra auditoria no DynamoDB (apenas se foi este worker que atualizou)
    if atualizou:
        await registrar_log(
            entidade=f"ingresso#{ingresso.id}",
            acao="TICKET_READY",
            usuario_id=None,
            dados={"pdf_key": key},
        )
        logger.info("Ingresso #%s processado com sucesso! Chave: %s", ingresso.id, key)
