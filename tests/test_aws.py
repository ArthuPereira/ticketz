import asyncio
from datetime import datetime, timedelta, timezone
from io import BytesIO
import json
from unittest.mock import patch
from botocore.exceptions import ClientError
from fastapi import status
import httpx
from httpx import ASGITransport, AsyncClient
from PIL import Image
import pytest
from redis.exceptions import RedisError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from src.core.aws import get_dynamodb_resource, get_s3_client
from src.core.cache import get_redis_client
from src.core.database import get_db
from src.core.settings import settings
from src.main import app

test_engine = create_async_engine(settings.database_url, poolclass=NullPool)
TestSessionLocal = async_sessionmaker(
    bind=test_engine, class_=AsyncSession, expire_on_commit=False
)


async def override_get_db():
    async with TestSessionLocal() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db


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


@pytest.fixture(autouse=True)
async def clean_database_and_cache():
    """Garante tabelas do Postgres, Redis e DynamoDB limpos para cada teste."""
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


def gerar_imagem_bytes(formato: str = "PNG", tamanho: tuple[int, int] = (100, 100)) -> bytes:
    """Gera bytes de uma imagem válida em memória."""
    img = Image.new("RGB", tamanho, color="blue")
    buf = BytesIO()
    img.save(buf, format=formato)
    return buf.getvalue()


async def criar_usuario_e_token(
    client: AsyncClient,
    email: str,
    papel: str = "organizer",
    nome: str = "Org AWS",
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
    nome: str = "Evento AWS",
    total_ingressos: int = 10,
) -> dict:
    data_futura = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
    res = await client.post(
        "/eventos",
        json={
            "nome": nome,
            "descricao": "Show de tecnologia",
            "local": "Auditório Central",
            "data": data_futura,
            "total_ingressos": total_ingressos,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    return res.json()


# =========================================================================
# 5A: S3 e Banner
# =========================================================================


@pytest.mark.asyncio
async def test_banner_por_quem_nao_e_dono_retorna_403():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, token_dono = await criar_usuario_e_token(client, "dono@teste.com")
        _, token_outro = await criar_usuario_e_token(client, "outro@teste.com")

        evento = await criar_evento_helper(client, token_dono)
        img_bytes = gerar_imagem_bytes("PNG")

        res = await client.post(
            f"/eventos/{evento['id']}/banner",
            files={"arquivo": ("banner.png", img_bytes, "image/png")},
            headers={"Authorization": f"Bearer {token_outro}"},
        )
        assert res.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_banner_arquivo_maior_que_5mb_retorna_413():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, token = await criar_usuario_e_token(client, "org5mb@teste.com")
        evento = await criar_evento_helper(client, token)

        payload_grande = b"0" * (5 * 1024 * 1024 + 10)  # > 5 MB
        res = await client.post(
            f"/eventos/{evento['id']}/banner",
            files={"arquivo": ("enorme.png", payload_grande, "image/png")},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == status.HTTP_413_REQUEST_ENTITY_TOO_LARGE


@pytest.mark.asyncio
async def test_banner_arquivo_falso_ou_invalido_retorna_415():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, token = await criar_usuario_e_token(client, "orgfalso@teste.com")
        evento = await criar_evento_helper(client, token)

        payload_txt = b"<html><body>Not an image</body></html>"
        res = await client.post(
            f"/eventos/{evento['id']}/banner",
            files={"arquivo": ("fraude.png", payload_txt, "image/png")},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == status.HTTP_415_UNSUPPORTED_MEDIA_TYPE


@pytest.mark.asyncio
async def test_banner_valido_upload_sucesso_e_presigned_url():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, token = await criar_usuario_e_token(client, "orgbanner@teste.com")
        evento = await criar_evento_helper(client, token)

        img_bytes = gerar_imagem_bytes("JPEG")
        res = await client.post(
            f"/eventos/{evento['id']}/banner",
            files={"arquivo": ("banner.jpg", img_bytes, "image/jpeg")},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == status.HTTP_200_OK
        data = res.json()
        assert data["banner_key"] is not None
        assert data["banner_key"].startswith(f"eventos/{evento['id']}/banner-")
        assert data["banner_url"] is not None
        assert "http" in data["banner_url"]

        # Verifica se o objeto existe no bucket real do S3
        s3 = get_s3_client()
        head = s3.head_object(
            Bucket=settings.s3_bucket_banners, Key=data["banner_key"]
        )
        assert head["ContentLength"] == len(img_bytes)

        # Testa download usando a presigned URL gerada
        async with httpx.AsyncClient() as http_client:
            download_res = await http_client.get(data["banner_url"])
            assert download_res.status_code == 200
            assert download_res.content == img_bytes


@pytest.mark.asyncio
async def test_segundo_upload_remove_objeto_antigo():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, token = await criar_usuario_e_token(client, "orgdois@teste.com")
        evento = await criar_evento_helper(client, token)

        # Primeiro upload
        img1 = gerar_imagem_bytes("PNG")
        res1 = await client.post(
            f"/eventos/{evento['id']}/banner",
            files={"arquivo": ("banner1.png", img1, "image/png")},
            headers={"Authorization": f"Bearer {token}"},
        )
        key1 = res1.json()["banner_key"]

        # Segundo upload
        img2 = gerar_imagem_bytes("JPEG")
        res2 = await client.post(
            f"/eventos/{evento['id']}/banner",
            files={"arquivo": ("banner2.jpg", img2, "image/jpeg")},
            headers={"Authorization": f"Bearer {token}"},
        )
        key2 = res2.json()["banner_key"]
        assert key1 != key2

        s3 = get_s3_client()
        # Novo objeto existe
        head2 = s3.head_object(Bucket=settings.s3_bucket_banners, Key=key2)
        assert head2["ContentLength"] == len(img2)

        # Objeto antigo foi removido
        with pytest.raises(ClientError):
            s3.head_object(Bucket=settings.s3_bucket_banners, Key=key1)


# =========================================================================
# 5B: Redis e Cache-Aside
# =========================================================================


@pytest.mark.asyncio
async def test_cache_miss_e_depois_hit_no_get_evento():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, token = await criar_usuario_e_token(client, "orgcache@teste.com")
        evento = await criar_evento_helper(client, token)
        ev_id = evento["id"]

        # 1ª consulta -> MISS
        r1 = await client.get(f"/eventos/{ev_id}")
        assert r1.status_code == 200
        assert r1.headers.get("X-Cache") == "MISS"

        # 2ª consulta imediata -> HIT
        r2 = await client.get(f"/eventos/{ev_id}")
        assert r2.status_code == 200
        assert r2.headers.get("X-Cache") == "HIT"


@pytest.mark.asyncio
async def test_put_evento_invalida_cache_e_retorna_miss():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, token = await criar_usuario_e_token(client, "orgput@teste.com")
        evento = await criar_evento_helper(client, token)
        ev_id = evento["id"]

        # Preenche o cache
        await client.get(f"/eventos/{ev_id}")
        r_hit = await client.get(f"/eventos/{ev_id}")
        assert r_hit.headers.get("X-Cache") == "HIT"

        # Atualiza o evento
        r_put = await client.put(
            f"/eventos/{ev_id}",
            json={"nome": "Nome Atualizado pelo Dono"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r_put.status_code == 200

        # Nova leitura deve dar MISS com o nome novo
        r_miss = await client.get(f"/eventos/{ev_id}")
        assert r_miss.status_code == 200
        assert r_miss.headers.get("X-Cache") == "MISS"
        assert r_miss.json()["nome"] == "Nome Atualizado pelo Dono"

        # Leitura seguinte volta a dar HIT
        r_hit2 = await client.get(f"/eventos/{ev_id}")
        assert r_hit2.headers.get("X-Cache") == "HIT"


@pytest.mark.asyncio
async def test_compra_invalida_cache_do_detalhe_e_retorna_miss():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, token_org = await criar_usuario_e_token(client, "orgcompra@teste.com")
        _, token_user = await criar_usuario_e_token(
            client, "comprador@teste.com", papel="user"
        )
        evento = await criar_evento_helper(client, token_org, total_ingressos=5)
        ev_id = evento["id"]

        # Aquecer cache
        await client.get(f"/eventos/{ev_id}")
        r_hit = await client.get(f"/eventos/{ev_id}")
        assert r_hit.headers.get("X-Cache") == "HIT"
        assert r_hit.json()["ingressos_disponiveis"] == 5

        # Usuário compra ingresso
        r_buy = await client.post(
            f"/eventos/{ev_id}/ingressos",
            headers={"Authorization": f"Bearer {token_user}"},
        )
        assert r_buy.status_code == 201

        # Detalhe do evento deve estar invalidado (MISS) e com ingressos = 4
        r_after = await client.get(f"/eventos/{ev_id}")
        assert r_after.status_code == 200
        assert r_after.headers.get("X-Cache") == "MISS"
        assert r_after.json()["ingressos_disponiveis"] == 4


@pytest.mark.asyncio
async def test_criar_evento_incrementa_versao_da_lista():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, token = await criar_usuario_e_token(client, "orglista@teste.com")

        # Lista inicial vazia -> MISS depois HIT
        r1 = await client.get("/eventos")
        assert r1.headers.get("X-Cache") == "MISS"
        assert r1.json()["total"] == 0

        r2 = await client.get("/eventos")
        assert r2.headers.get("X-Cache") == "HIT"

        # Cria novo evento
        await criar_evento_helper(client, token, nome="Evento Novo na Vitrine")

        # A lista pública deve responder MISS devido ao incremento da versão
        r3 = await client.get("/eventos")
        assert r3.headers.get("X-Cache") == "MISS"
        assert r3.json()["total"] == 1
        assert r3.json()["items"][0]["nome"] == "Evento Novo na Vitrine"


@pytest.mark.asyncio
async def test_dois_usuarios_consultando_mesmo_evento_veem_apenas_proprio_meu_ingresso():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, token_org = await criar_usuario_e_token(client, "orgmulti@teste.com")
        _, token_a = await criar_usuario_e_token(client, "user_a@teste.com", papel="user")
        _, token_b = await criar_usuario_e_token(client, "user_b@teste.com", papel="user")

        evento = await criar_evento_helper(client, token_org)
        ev_id = evento["id"]

        # Usuário A compra ingresso
        await client.post(
            f"/eventos/{ev_id}/ingressos",
            headers={"Authorization": f"Bearer {token_a}"},
        )

        # Usuário A consulta o evento -> vê seu ingresso
        r_a = await client.get(
            f"/eventos/{ev_id}", headers={"Authorization": f"Bearer {token_a}"}
        )
        assert r_a.json()["meu_ingresso"] is not None

        # Usuário B consulta o mesmo evento (mesmo com cache) -> não vê ingresso do A
        r_b = await client.get(
            f"/eventos/{ev_id}", headers={"Authorization": f"Bearer {token_b}"}
        )
        assert r_b.json()["meu_ingresso"] is None


@pytest.mark.asyncio
async def test_redis_parado_degrada_graciosamente_e_health_ready_indica_erro():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, token = await criar_usuario_e_token(client, "orgredisfora@teste.com")
        evento = await criar_evento_helper(client, token)
        ev_id = evento["id"]

        # Simula falha geral no Redis
        with patch("src.core.cache.get_redis_client") as mock_get_redis:
            mock_redis = mock_get_redis.return_value
            mock_redis.get.side_effect = RedisError("Connection refused")
            mock_redis.set.side_effect = RedisError("Connection refused")
            mock_redis.ping.side_effect = RedisError("Connection refused")

            # A rota deve responder 200 normalmente com os dados do banco
            res = await client.get(f"/eventos/{ev_id}")
            assert res.status_code == 200
            assert res.headers.get("X-Cache") == "MISS"
            assert res.json()["nome"] == evento["nome"]

            # Health ready deve indicar 503 com redis em erro
            hr = await client.get("/health/ready")
            assert hr.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
            dados_hr = hr.json()
            assert dados_hr["status"] == "unhealthy"
            assert dados_hr["redis"] == "error"
            assert dados_hr["rds"] == "ok"


# =========================================================================
# 5C: DynamoDB e Logs de Ações
# =========================================================================


@pytest.mark.asyncio
async def test_dynamodb_log_criar_evento():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        org_id, token = await criar_usuario_e_token(client, "orglog1@teste.com")
        evento = await criar_evento_helper(client, token, nome="Evento Auditoria")
        ev_id = evento["id"]

        dynamodb = get_dynamodb_resource()
        table = dynamodb.Table(settings.DYNAMODB_TABLE)
        res = table.query(
            KeyConditionExpression=boto3_key("entidade").eq(f"evento#{ev_id}")
        )
        items = res.get("Items", [])
        assert len(items) >= 1
        create_item = next((it for it in items if it["acao"] == "CREATE_EVENT"), None)
        assert create_item is not None
        assert create_item["usuario_id"] == org_id
        assert create_item["dados"]["nome"] == "Evento Auditoria"
        assert "timestamp" in create_item


@pytest.mark.asyncio
async def test_dynamodb_log_put_evento_com_antes_e_depois():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, token = await criar_usuario_e_token(client, "orglogput@teste.com")
        evento = await criar_evento_helper(client, token, nome="Nome Inicial")
        ev_id = evento["id"]

        await client.put(
            f"/eventos/{ev_id}",
            json={"nome": "Nome Modificado"},
            headers={"Authorization": f"Bearer {token}"},
        )

        dynamodb = get_dynamodb_resource()
        table = dynamodb.Table(settings.DYNAMODB_TABLE)
        res = table.query(
            KeyConditionExpression=boto3_key("entidade").eq(f"evento#{ev_id}")
        )
        items = res.get("Items", [])
        put_item = next((it for it in items if it["acao"] == "UPDATE_EVENT"), None)
        assert put_item is not None
        assert put_item["dados"]["antes"]["nome"] == "Nome Inicial"
        assert put_item["dados"]["depois"]["nome"] == "Nome Modificado"


@pytest.mark.asyncio
async def test_get_eventos_id_logs_ordenado_e_paginado():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, token = await criar_usuario_e_token(client, "orglogs@teste.com")
        evento = await criar_evento_helper(client, token)
        ev_id = evento["id"]

        # Realiza 3 alterações para gerar mais entradas no log
        for i in range(3):
            await client.put(
                f"/eventos/{ev_id}",
                json={"nome": f"Nome Edicao {i}"},
                headers={"Authorization": f"Bearer {token}"},
            )

        # Consulta página 1 com limit=2
        res1 = await client.get(
            f"/eventos/{ev_id}/logs?limit=2",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res1.status_code == 200
        p1 = res1.json()
        assert len(p1["items"]) == 2
        assert p1["cursor"] is not None
        # Mais recentes primeiro: primeira entrada deve ser a última edição
        assert p1["items"][0]["acao"] == "UPDATE_EVENT"

        # Consulta página 2 usando o cursor
        res2 = await client.get(
            f"/eventos/{ev_id}/logs?limit=2&cursor={p1['cursor']}",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res2.status_code == 200
        p2 = res2.json()
        assert len(p2["items"]) >= 1


@pytest.mark.asyncio
async def test_gravacao_dynamodb_falhando_nao_derruba_requisicao():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, token = await criar_usuario_e_token(client, "orgdynamofail@teste.com")

        with patch("src.core.action_log.get_dynamodb_resource") as mock_get_ddb:
            mock_ddb = mock_get_ddb.return_value
            mock_table = mock_ddb.Table.return_value
            mock_table.put_item.side_effect = Exception("DynamoDB Timeout")

            data_futura = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
            res = await client.post(
                "/eventos",
                json={
                    "nome": "Evento Resiliente",
                    "local": "Auditório",
                    "data": data_futura,
                    "total_ingressos": 10,
                },
                headers={"Authorization": f"Bearer {token}"},
            )
            # Requisição deve responder 201 Created normalmente
            assert res.status_code == status.HTTP_201_CREATED
            assert res.json()["nome"] == "Evento Resiliente"


@pytest.mark.asyncio
async def test_nenhum_log_no_dynamodb_contem_senha_ou_hash():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        await client.post(
            "/auth/register",
            json={
                "nome": "Usuario Segredo",
                "email": "segredo@teste.com",
                "senha": "super_secret_password_123",
                "papel": "user",
            },
        )

        dynamodb = get_dynamodb_resource()
        table = dynamodb.Table(settings.DYNAMODB_TABLE)
        scan = table.scan()
        items = scan.get("Items", [])
        assert len(items) > 0

        for item in items:
            raw_text = json.dumps(item, default=str).lower()
            assert "super_secret_password_123" not in raw_text
            assert "senha_hash" not in raw_text


# =========================================================================
# Health Ready & Cache Stats
# =========================================================================


@pytest.mark.asyncio
async def test_health_ready_e_cache_stats():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        res_ready = await client.get("/health/ready")
        assert res_ready.status_code == 200
        dados = res_ready.json()
        assert dados["status"] == "ready"
        assert dados["rds"] == "ok"
        assert dados["redis"] == "ok"
        assert dados["dynamodb"] == "ok"

        res_stats = await client.get("/cache/stats")
        assert res_stats.status_code == 200
        stats = res_stats.json()
        assert "hits" in stats
        assert "misses" in stats
        assert "hit_rate_percent" in stats


def boto3_key(name: str):
    from boto3.dynamodb.conditions import Key
    return Key(name)
