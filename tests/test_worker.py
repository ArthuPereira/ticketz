import asyncio
from datetime import datetime, timedelta, timezone
from io import BytesIO
import json
from unittest.mock import patch

from botocore.exceptions import ClientError
from fastapi import status
import httpx
from httpx import ASGITransport, AsyncClient
import pytest
from redis.exceptions import RedisError
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from src.core.aws import get_dynamodb_resource, get_s3_client, get_sqs_client
from src.core.cache import get_redis_client
from src.core.database import get_db
from src.core.models import Ingresso, StatusIngresso
from src.core.settings import settings
from src.main import app
from worker.handler import (
    ErroPermanente,
    extrair_id,
    extrair_id_seguro,
    marcar_failed,
    marcar_ready,
    processar,
    set_worker_session_maker,
)
from worker.pdf import DadosIngressoPDF, formatar_data, gerar_pdf, limpar_texto
from worker.__main__ import (
    loop_worker,
    reconciliar_ingressos_orfaos,
    tarefa_reconciliacao,
)

test_engine = create_async_engine(settings.database_url, poolclass=NullPool)
TestSessionLocal = async_sessionmaker(
    bind=test_engine, class_=AsyncSession, expire_on_commit=False
)


async def override_get_db():
    async with TestSessionLocal() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db
set_worker_session_maker(TestSessionLocal)


def _limpar_dynamodb():
    try:
        dynamodb = get_dynamodb_resource()
        table = dynamodb.Table(settings.DYNAMODB_TABLE)
        scan = table.scan(ProjectionExpression="entidade, sk")
        with table.batch_writer() as batch:
            for item in scan.get("Items", []):
                batch.delete_item(Key={"entidade": item["entidade"], "sk": item["sk"]})
    except Exception:
        pass


def _purgar_fila_sqs():
    try:
        sqs = get_sqs_client()
        # Drena mensagens residuais da fila
        while True:
            res = sqs.receive_message(
                QueueUrl=settings.SQS_QUEUE_URL,
                MaxNumberOfMessages=10,
                WaitTimeSeconds=1,
            )
            msgs = res.get("Messages", [])
            if not msgs:
                break
            for m in msgs:
                sqs.delete_message(
                    QueueUrl=settings.SQS_QUEUE_URL,
                    ReceiptHandle=m["ReceiptHandle"],
                )
    except Exception:
        pass


@pytest.fixture(autouse=True)
async def clean_database_cache_and_queue():
    """Garante tabelas do Postgres, Redis, DynamoDB e fila SQS limpos antes e após cada teste."""
    async with TestSessionLocal() as session:
        await session.execute(
            text(
                "TRUNCATE TABLE ingressos, eventos, usuarios RESTART IDENTITY CASCADE;"
            )
        )
        await session.commit()

    redis = get_redis_client()
    try:
        await redis.flushdb()
    except Exception:
        pass

    _limpar_dynamodb()
    _purgar_fila_sqs()

    yield

    async with TestSessionLocal() as session:
        await session.execute(
            text(
                "TRUNCATE TABLE ingressos, eventos, usuarios RESTART IDENTITY CASCADE;"
            )
        )
        await session.commit()

    try:
        await redis.flushdb()
    except Exception:
        pass

    _limpar_dynamodb()
    _purgar_fila_sqs()


async def criar_usuario_e_token(
    client: AsyncClient,
    email: str,
    papel: str = "organizer",
    nome: str = "Org Worker",
) -> tuple[int, str]:
    res = await client.post(
        "/auth/register",
        json={"nome": nome, "email": email, "senha": "senhaforte123", "papel": papel},
    )
    user_id = res.json()["id"]
    res_login = await client.post(
        "/auth/login",
        json={"email": email, "senha": "senhaforte123"},
    )
    token = res_login.json()["access_token"]
    return user_id, token


async def criar_evento_helper(
    client: AsyncClient,
    token: str,
    nome: str = "Show Worker",
    total_ingressos: int = 10,
) -> dict:
    data_futura = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
    res = await client.post(
        "/eventos",
        json={
            "nome": nome,
            "descricao": "Evento para teste de worker",
            "local": "Centro Cultural",
            "data": data_futura,
            "total_ingressos": total_ingressos,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    return res.json()


# =========================================================================
# 6A: Testes do Gerador de PDF
# =========================================================================


def test_gerador_pdf_conteudo_e_formato():
    dt = datetime(2026, 11, 20, 20, 0, tzinfo=timezone.utc)
    dados = DadosIngressoPDF(
        ingresso_id=10,
        codigo="123e4567-e89b-12d3-a456-426614174000",
        evento_nome="Festival de Música Brasileira 🇧🇷 com Título Extenso",
        evento_data=dt,
        evento_local="Arena Castelão",
        usuario_nome="Maria Joaquina",
        usuario_email="maria@exemplo.com",
    )

    pdf_bytes = gerar_pdf(dados)
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 1000
    assert pdf_bytes.startswith(b"%PDF-")

    # Verifica limpeza de emojis para compatibilidade com Helvetica
    texto_limpo = limpar_texto("Show 🇧🇷 Show")
    assert "🇧🇷" not in texto_limpo

    # Formatação de data em America/Fortaleza (-3h)
    data_str = formatar_data(dt)
    assert "17:00" in data_str


def test_extracao_mensagem_sqs():
    # Mensagem JSON direta (raw delivery)
    assert extrair_id('{"ingresso_id": 42}') == 42
    assert extrair_id_seguro('{"ingresso_id": 42}') == 42

    # Mensagem embrulhada pelo SNS
    sns_envelope = json.dumps({
        "Type": "Notification",
        "Message": json.dumps({"ingresso_id": 88}),
    })
    assert extrair_id(sns_envelope) == 88

    # Mensagens inválidas geram ErroPermanente
    with pytest.raises(ErroPermanente):
        extrair_id("not-json")

    with pytest.raises(ErroPermanente):
        extrair_id('{"outro_campo": 123}')

    assert extrair_id_seguro("not-json") is None


# =========================================================================
# 6B: Processamento do Worker & Idempotência
# =========================================================================


@pytest.mark.asyncio
async def test_processar_ingresso_sucesso_s3_e_dynamodb():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, token_org = await criar_usuario_e_token(client, "orgproc@teste.com")
        _, token_user = await criar_usuario_e_token(
            client, "userproc@teste.com", papel="user", nome="Comprador Silva"
        )
        evento = await criar_evento_helper(client, token_org)

        # Compra ingresso -> status PENDING
        res_compra = await client.post(
            f"/eventos/{evento['id']}/ingressos",
            headers={"Authorization": f"Bearer {token_user}"},
        )
        assert res_compra.status_code == 201
        ing_id = res_compra.json()["id"]

        # Processa com o worker
        await processar(ing_id)

        # Verifica no Postgres se virou READY e preencheu pdf_key
        async with TestSessionLocal() as session:
            stmt = select(Ingresso).where(Ingresso.id == ing_id)
            ingresso_db = (await session.execute(stmt)).scalar_one()
            assert ingresso_db.status == StatusIngresso.READY
            assert ingresso_db.pdf_key == f"eventos/{evento['id']}/ingressos/{ing_id}.pdf"
            assert ingresso_db.pronto_em is not None

        # Verifica no S3 se o PDF existe
        s3 = get_s3_client()
        head = s3.head_object(
            Bucket=settings.s3_bucket_tickets, Key=ingresso_db.pdf_key
        )
        assert head["ContentLength"] > 1000

        # Verifica log TICKET_READY no DynamoDB com usuario_id nulo
        dynamodb = get_dynamodb_resource()
        table = dynamodb.Table(settings.DYNAMODB_TABLE)
        res_ddb = table.query(
            KeyConditionExpression=boto3_key("entidade").eq(f"ingresso#{ing_id}")
        )
        items = res_ddb.get("Items", [])
        ticket_ready = next((it for it in items if it["acao"] == "TICKET_READY"), None)
        assert ticket_ready is not None
        assert ticket_ready.get("usuario_id") is None
        assert ticket_ready["dados"]["pdf_key"] == ingresso_db.pdf_key


@pytest.mark.asyncio
async def test_processar_idempotencia_duplicata():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, token_org = await criar_usuario_e_token(client, "orgidem@teste.com")
        _, token_user = await criar_usuario_e_token(
            client, "useridem@teste.com", papel="user"
        )
        evento = await criar_evento_helper(client, token_org)

        res_compra = await client.post(
            f"/eventos/{evento['id']}/ingressos",
            headers={"Authorization": f"Bearer {token_user}"},
        )
        ing_id = res_compra.json()["id"]

        # Primeira execução
        await processar(ing_id)

        # Segunda execução simulando mensagem duplicada
        await processar(ing_id)

        # Deve haver apenas UM log TICKET_READY no DynamoDB
        dynamodb = get_dynamodb_resource()
        table = dynamodb.Table(settings.DYNAMODB_TABLE)
        res_ddb = table.query(
            KeyConditionExpression=boto3_key("entidade").eq(f"ingresso#{ing_id}")
        )
        ready_logs = [it for it in res_ddb.get("Items", []) if it["acao"] == "TICKET_READY"]
        assert len(ready_logs) == 1


# =========================================================================
# 6C: Endpoints de Download e Reprocessar
# =========================================================================


@pytest.mark.asyncio
async def test_download_ingresso_pendente_retorna_409():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, token_org = await criar_usuario_e_token(client, "orgdl409@teste.com")
        _, token_user = await criar_usuario_e_token(
            client, "userdl409@teste.com", papel="user"
        )
        evento = await criar_evento_helper(client, token_org)

        res_compra = await client.post(
            f"/eventos/{evento['id']}/ingressos",
            headers={"Authorization": f"Bearer {token_user}"},
        )
        ing_id = res_compra.json()["id"]

        # Sem rodar o worker, ingresso está PENDING
        res_dl = await client.get(
            f"/ingressos/{ing_id}/download",
            headers={"Authorization": f"Bearer {token_user}"},
        )
        assert res_dl.status_code == status.HTTP_409_CONFLICT
        assert res_dl.json()["detail"]["codigo"] == "INGRESSO_NAO_PRONTO"


@pytest.mark.asyncio
async def test_download_ingresso_outro_usuario_retorna_404():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, token_org = await criar_usuario_e_token(client, "orgdl404@teste.com")
        _, token_user1 = await criar_usuario_e_token(
            client, "user1@teste.com", papel="user"
        )
        _, token_user2 = await criar_usuario_e_token(
            client, "user2@teste.com", papel="user"
        )
        evento = await criar_evento_helper(client, token_org)

        res_compra = await client.post(
            f"/eventos/{evento['id']}/ingressos",
            headers={"Authorization": f"Bearer {token_user1}"},
        )
        ing_id = res_compra.json()["id"]
        await processar(ing_id)

        # Usuário 2 tenta baixar ingresso do Usuário 1
        res_dl = await client.get(
            f"/ingressos/{ing_id}/download",
            headers={"Authorization": f"Bearer {token_user2}"},
        )
        assert res_dl.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_download_ingresso_valido_sucesso_e_conteudo():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, token_org = await criar_usuario_e_token(client, "orgdl200@teste.com")
        _, token_user = await criar_usuario_e_token(
            client, "userdl200@teste.com", papel="user"
        )
        evento = await criar_evento_helper(client, token_org)

        res_compra = await client.post(
            f"/eventos/{evento['id']}/ingressos",
            headers={"Authorization": f"Bearer {token_user}"},
        )
        ing_id = res_compra.json()["id"]
        await processar(ing_id)

        res_dl = await client.get(
            f"/ingressos/{ing_id}/download",
            headers={"Authorization": f"Bearer {token_user}"},
        )
        assert res_dl.status_code == status.HTTP_200_OK
        data = res_dl.json()
        assert "url" in data
        assert data["expira_em"] == 300

        # Baixa o PDF usando a presigned URL gerada
        async with httpx.AsyncClient() as http_client:
            res_pdf = await http_client.get(data["url"])
            assert res_pdf.status_code == 200
            assert res_pdf.content.startswith(b"%PDF-")


@pytest.mark.asyncio
async def test_reprocessar_ingresso_failed_sucesso_e_rejeicao_outros_status():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, token_org = await criar_usuario_e_token(client, "orgrep@teste.com")
        _, token_user = await criar_usuario_e_token(
            client, "userrep@teste.com", papel="user"
        )
        evento = await criar_evento_helper(client, token_org)

        res_compra = await client.post(
            f"/eventos/{evento['id']}/ingressos",
            headers={"Authorization": f"Bearer {token_user}"},
        )
        ing_id = res_compra.json()["id"]

        # Tentativa de reprocessar ingresso ainda em PENDING -> 409
        r_pendente = await client.post(
            f"/ingressos/{ing_id}/reprocessar",
            headers={"Authorization": f"Bearer {token_user}"},
        )
        assert r_pendente.status_code == status.HTTP_409_CONFLICT
        assert r_pendente.json()["detail"]["codigo"] == "INGRESSO_NAO_FAILED"

        # Simula falha e altera para FAILED
        async with TestSessionLocal() as session:
            await session.execute(
                update(Ingresso).where(Ingresso.id == ing_id).values(status=StatusIngresso.FAILED)
            )
            await session.commit()

        # Agora reprocessar deve ter sucesso (202 Accepted)
        _purgar_fila_sqs()
        r_reproc = await client.post(
            f"/ingressos/{ing_id}/reprocessar",
            headers={"Authorization": f"Bearer {token_user}"},
        )
        assert r_reproc.status_code == status.HTTP_202_ACCEPTED
        assert r_reproc.json()["status"] == StatusIngresso.PENDING

        # Confirma que a mensagem foi republicada na fila SQS
        sqs = get_sqs_client()
        res_sqs = sqs.receive_message(QueueUrl=settings.SQS_QUEUE_URL, WaitTimeSeconds=5)
        msgs = res_sqs.get("Messages", [])
        assert len(msgs) == 1
        assert extrair_id(msgs[0]["Body"]) == ing_id


# =========================================================================
# 6D: Loop Principal, Fila e Reconciliação
# =========================================================================


@pytest.mark.asyncio
async def test_worker_loop_processa_fila_e_limpa_mensagem():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, token_org = await criar_usuario_e_token(client, "orgloop@teste.com")
        _, token_user = await criar_usuario_e_token(
            client, "userloop@teste.com", papel="user"
        )
        evento = await criar_evento_helper(client, token_org)

        # Compra ingresso -> publica no SNS -> entrega no SQS
        res_compra = await client.post(
            f"/eventos/{evento['id']}/ingressos",
            headers={"Authorization": f"Bearer {token_user}"},
        )
        ing_id = res_compra.json()["id"]

        # Executa uma iteração do loop do worker
        parar = asyncio.Event()
        await loop_worker(parar, max_iterations=1)

        # Verifica se o ingresso ficou READY
        async with TestSessionLocal() as session:
            stmt = select(Ingresso).where(Ingresso.id == ing_id)
            ingresso = (await session.execute(stmt)).scalar_one()
            assert ingresso.status == StatusIngresso.READY

        # Verifica se a fila SQS está vazia (mensagem foi deletada com sucesso)
        sqs = get_sqs_client()
        res_sqs = sqs.receive_message(
            QueueUrl=settings.SQS_QUEUE_URL,
            MaxNumberOfMessages=1,
            WaitTimeSeconds=1,
        )
        assert len(res_sqs.get("Messages", [])) == 0


@pytest.mark.asyncio
async def test_worker_max_tentativas_marca_failed():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, token_org = await criar_usuario_e_token(client, "orgfail@teste.com")
        _, token_user = await criar_usuario_e_token(
            client, "userfail@teste.com", papel="user"
        )
        evento = await criar_evento_helper(client, token_org)

        res_compra = await client.post(
            f"/eventos/{evento['id']}/ingressos",
            headers={"Authorization": f"Bearer {token_user}"},
        )
        ing_id = res_compra.json()["id"]

        # Simula erro de S3 ou banco durante o processamento
        with patch("worker.__main__.processar", side_effect=Exception("S3 Indisponível")):
            sqs = get_sqs_client()
            # Envia mensagem simulando tentativa 3 (limite máximo)
            # Para testar o comportamento do loop_worker com tentativa 3:
            parar = asyncio.Event()

            # Mockamos receive_message para injetar ApproximateReceiveCount = "3"
            fake_msg = {
                "Messages": [
                    {
                        "Body": json.dumps({"ingresso_id": ing_id}),
                        "ReceiptHandle": "fake-handle",
                        "Attributes": {"ApproximateReceiveCount": "3"},
                    }
                ]
            }
            with patch.object(sqs, "receive_message", return_value=fake_msg):
                await loop_worker(parar, max_iterations=1)

        # O ingresso deve ter sido marcado como FAILED
        async with TestSessionLocal() as session:
            stmt = select(Ingresso).where(Ingresso.id == ing_id)
            ingresso = (await session.execute(stmt)).scalar_one()
            assert ingresso.status == StatusIngresso.FAILED


@pytest.mark.asyncio
async def test_reconciliacao_republica_ingressos_pendentes_antigos():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, token_org = await criar_usuario_e_token(client, "orgrec@teste.com")
        _, token_user = await criar_usuario_e_token(
            client, "userrec@teste.com", papel="user"
        )
        evento = await criar_evento_helper(client, token_org)

        res_compra = await client.post(
            f"/eventos/{evento['id']}/ingressos",
            headers={"Authorization": f"Bearer {token_user}"},
        )
        ing_id = res_compra.json()["id"]

        # Força data de criação para 10 minutos atrás
        dez_min_atras = datetime.now(timezone.utc) - timedelta(minutes=10)
        async with TestSessionLocal() as session:
            await session.execute(
                update(Ingresso).where(Ingresso.id == ing_id).values(criado_em=dez_min_atras)
            )
            await session.commit()

        _purgar_fila_sqs()

        # Executa ciclo de reconciliação
        reconciliados = await reconciliar_ingressos_orfaos()
        assert reconciliados >= 1

        # Mensagem deve ter sido republicada na fila SQS
        sqs = get_sqs_client()
        res_sqs = sqs.receive_message(QueueUrl=settings.SQS_QUEUE_URL, WaitTimeSeconds=5)
        msgs = res_sqs.get("Messages", [])
        assert len(msgs) >= 1
        assert extrair_id(msgs[0]["Body"]) == ing_id


def boto3_key(name: str):
    from boto3.dynamodb.conditions import Key
    return Key(name)
