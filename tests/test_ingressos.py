from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from src.core.database import get_db
from src.core.models import Evento
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


@pytest.fixture(autouse=True)
async def clean_database():
    """Limpa tabelas antes e depois de cada teste."""
    async with TestSessionLocal() as session:
        await session.execute(
            text(
                "TRUNCATE TABLE ingressos, eventos, usuarios RESTART IDENTITY CASCADE;"
            )
        )
        await session.commit()
    yield
    async with TestSessionLocal() as session:
        await session.execute(
            text(
                "TRUNCATE TABLE ingressos, eventos, usuarios RESTART IDENTITY CASCADE;"
            )
        )
        await session.commit()


async def criar_usuario_e_token(
    client: AsyncClient,
    email: str,
    papel: str = "user",
    nome: str = "Usuario Teste",
) -> tuple[int, str]:
    await client.post(
        "/auth/register",
        json={"nome": nome, "email": email, "senha": "senhaforte123", "papel": papel},
    )
    res = await client.post(
        "/auth/login",
        json={"email": email, "senha": "senhaforte123"},
    )
    token = res.json()["access_token"]
    me_res = await client.get(
        "/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    user_id = me_res.json()["id"]
    return user_id, token


async def criar_evento_teste(
    client: AsyncClient,
    org_token: str,
    total_ingressos: int = 10,
    nome: str = "Evento Teste",
    dias_futuro: int = 5,
) -> int:
    data_futura = (
        datetime.now(timezone.utc) + timedelta(days=dias_futuro)
    ).isoformat()
    res = await client.post(
        "/eventos",
        json={
            "nome": nome,
            "descricao": "Descricao",
            "local": "Local Show",
            "data": data_futura,
            "total_ingressos": total_ingressos,
        },
        headers={"Authorization": f"Bearer {org_token}"},
    )
    return res.json()["id"]


# 1. Comprar sem token -> 401
@pytest.mark.asyncio
async def test_comprar_sem_token_retorna_401():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        res = await client.post("/eventos/1/ingressos")
        assert res.status_code == 401


# 2. Evento inexistente ou inativo -> 404
@pytest.mark.asyncio
async def test_comprar_evento_inexistente_ou_inativo_retorna_404():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, user_token = await criar_usuario_e_token(client, "u1@test.com")
        _, org_token = await criar_usuario_e_token(
            client, "org@test.com", papel="organizer"
        )

        # Inexistente
        res_inexistente = await client.post(
            "/eventos/9999/ingressos",
            headers={"Authorization": f"Bearer {user_token}"},
        )
        assert res_inexistente.status_code == 404
        assert res_inexistente.json()["detail"] == "Evento não encontrado"

        # Inativo (soft deleted)
        ev_id = await criar_evento_teste(client, org_token)
        del_res = await client.delete(
            f"/eventos/{ev_id}", headers={"Authorization": f"Bearer {org_token}"}
        )
        assert del_res.status_code == 204

        res_inativo = await client.post(
            f"/eventos/{ev_id}/ingressos",
            headers={"Authorization": f"Bearer {user_token}"},
        )
        assert res_inativo.status_code == 404
        assert res_inativo.json()["detail"] == "Evento não encontrado"


# 3. Evento com data passada -> 409 EVENTO_ENCERRADO, estoque intacto
@pytest.mark.asyncio
async def test_comprar_evento_encerrado_retorna_409():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        org_id, _ = await criar_usuario_e_token(
            client, "org@test.com", papel="organizer"
        )
        _, user_token = await criar_usuario_e_token(client, "u1@test.com")

        # Insere evento com data passada direto no banco
        async with TestSessionLocal() as session:
            ev = Evento(
                organizador_id=org_id,
                nome="Evento Passado",
                local="Local Antigo",
                data=datetime.now(timezone.utc) - timedelta(days=2),
                total_ingressos=10,
                ingressos_disponiveis=10,
                ativo=True,
            )
            session.add(ev)
            await session.commit()
            await session.refresh(ev)
            ev_id = ev.id

        res = await client.post(
            f"/eventos/{ev_id}/ingressos",
            headers={"Authorization": f"Bearer {user_token}"},
        )
        assert res.status_code == 409
        body = res.json()["detail"]
        assert body["codigo"] == "EVENTO_ENCERRADO"

        # Confere que o estoque ficou intacto
        async with TestSessionLocal() as session:
            ev_check = (
                await session.execute(
                    text(
                        "SELECT ingressos_disponiveis FROM eventos WHERE id = :id"
                    ),
                    {"id": ev_id},
                )
            ).scalar()
            assert ev_check == 10


# 4. Compra válida -> 201, status PENDING, estoque diminuiu em 1
@pytest.mark.asyncio
async def test_compra_valida():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, org_token = await criar_usuario_e_token(
            client, "org@test.com", papel="organizer"
        )
        _, user_token = await criar_usuario_e_token(client, "u1@test.com")
        ev_id = await criar_evento_teste(
            client, org_token, total_ingressos=5, nome="Rock Festival"
        )

        res = await client.post(
            f"/eventos/{ev_id}/ingressos",
            headers={"Authorization": f"Bearer {user_token}"},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["id"] == 1
        assert data["status"] == "PENDING"
        assert data["evento"]["id"] == ev_id
        assert data["evento"]["nome"] == "Rock Festival"
        assert "codigo" not in data  # UUID protegido
        assert "pdf_key" not in data  # S3 key protegida

        # Confere estoque reduzido para 4
        ev_res = await client.get(f"/eventos/{ev_id}")
        assert ev_res.json()["ingressos_disponiveis"] == 4

        # Confere campo meu_ingresso na consulta de evento
        ev_meu_ing = await client.get(
            f"/eventos/{ev_id}", headers={"Authorization": f"Bearer {user_token}"}
        )
        assert ev_meu_ing.json()["meu_ingresso"] == {
            "id": 1,
            "status": "PENDING",
        }


# 5. Segunda compra do mesmo usuário -> 409 JA_POSSUI_INGRESSO, estoque inalterado
@pytest.mark.asyncio
async def test_segunda_compra_mesmo_usuario_retorna_409():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, org_token = await criar_usuario_e_token(
            client, "org@test.com", papel="organizer"
        )
        _, user_token = await criar_usuario_e_token(client, "u1@test.com")
        ev_id = await criar_evento_teste(client, org_token, total_ingressos=5)

        # 1ª compra: Sucesso 201
        res1 = await client.post(
            f"/eventos/{ev_id}/ingressos",
            headers={"Authorization": f"Bearer {user_token}"},
        )
        assert res1.status_code == 201

        # 2ª compra: 409 JA_POSSUI_INGRESSO
        res2 = await client.post(
            f"/eventos/{ev_id}/ingressos",
            headers={"Authorization": f"Bearer {user_token}"},
        )
        assert res2.status_code == 409
        assert res2.json()["detail"]["codigo"] == "JA_POSSUI_INGRESSO"

        # Estoque permaneceu 4 (não descontou de novo)
        ev_res = await client.get(f"/eventos/{ev_id}")
        assert ev_res.json()["ingressos_disponiveis"] == 4


# 6 & 7. Evento com 1 vaga, dois usuários em sequência (201 e 409 ESGOTADO) e sem ingresso órfão
@pytest.mark.asyncio
async def test_lote_esgotado_e_sem_ingresso_orfao():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, org_token = await criar_usuario_e_token(
            client, "org@test.com", papel="organizer"
        )
        _, u1_token = await criar_usuario_e_token(client, "u1@test.com")
        _, u2_token = await criar_usuario_e_token(client, "u2@test.com")

        # Evento com apenas 1 ingresso
        ev_id = await criar_evento_teste(client, org_token, total_ingressos=1)

        # Usuário 1 compra a última vaga
        r1 = await client.post(
            f"/eventos/{ev_id}/ingressos",
            headers={"Authorization": f"Bearer {u1_token}"},
        )
        assert r1.status_code == 201

        # Usuário 2 tenta comprar -> ESGOTADO
        r2 = await client.post(
            f"/eventos/{ev_id}/ingressos",
            headers={"Authorization": f"Bearer {u2_token}"},
        )
        assert r2.status_code == 409
        assert r2.json()["detail"]["codigo"] == "ESGOTADO"

        # Prova do rollback: nenhum ingresso órfão no banco, total de ingressos deve ser exatamente 1
        async with TestSessionLocal() as session:
            count = (
                await session.execute(
                    text("SELECT count(*) FROM ingressos WHERE evento_id = :id"),
                    {"id": ev_id},
                )
            ).scalar()
            assert count == 1

            disp = (
                await session.execute(
                    text(
                        "SELECT ingressos_disponiveis FROM eventos WHERE id = :id"
                    ),
                    {"id": ev_id},
                )
            ).scalar()
            assert disp == 0


# 8. GET /ingressos -> Só os meus, mais recentes primeiro, inclui eventos inativos
@pytest.mark.asyncio
async def test_listar_meus_ingressos_ordenacao_e_eventos_inativos():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, org_token = await criar_usuario_e_token(
            client, "org@test.com", papel="organizer"
        )
        _, u1_token = await criar_usuario_e_token(client, "u1@test.com")
        _, u2_token = await criar_usuario_e_token(client, "u2@test.com")

        ev1_id = await criar_evento_teste(
            client, org_token, nome="Evento 1 Ativo"
        )
        ev2_id = await criar_evento_teste(
            client, org_token, nome="Evento 2 Sera Inativo"
        )

        # U1 compra ev1 e ev2
        await client.post(
            f"/eventos/{ev1_id}/ingressos",
            headers={"Authorization": f"Bearer {u1_token}"},
        )
        await client.post(
            f"/eventos/{ev2_id}/ingressos",
            headers={"Authorization": f"Bearer {u1_token}"},
        )

        # U2 compra ev1
        await client.post(
            f"/eventos/{ev1_id}/ingressos",
            headers={"Authorization": f"Bearer {u2_token}"},
        )

        # Organizador apaga ev2 (soft delete)
        await client.delete(
            f"/eventos/{ev2_id}", headers={"Authorization": f"Bearer {org_token}"}
        )

        # Consulta lista de ingressos de U1
        res = await client.get(
            "/ingressos", headers={"Authorization": f"Bearer {u1_token}"}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2

        # Mais recente primeiro: ev2 veio depois de ev1
        assert data["items"][0]["evento"]["id"] == ev2_id
        assert data["items"][0]["evento"]["nome"] == "Evento 2 Sera Inativo"
        assert data["items"][1]["evento"]["id"] == ev1_id

        # U2 vê apenas o seu ingresso
        res_u2 = await client.get(
            "/ingressos", headers={"Authorization": f"Bearer {u2_token}"}
        )
        assert res_u2.json()["total"] == 1
        assert res_u2.json()["items"][0]["evento"]["id"] == ev1_id


# 9. GET /ingressos/{id} de outro usuário -> 404
@pytest.mark.asyncio
async def test_obter_ingresso_de_outro_usuario_retorna_404():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, org_token = await criar_usuario_e_token(
            client, "org@test.com", papel="organizer"
        )
        _, u1_token = await criar_usuario_e_token(client, "u1@test.com")
        _, u2_token = await criar_usuario_e_token(client, "u2@test.com")

        ev_id = await criar_evento_teste(client, org_token)
        buy_res = await client.post(
            f"/eventos/{ev_id}/ingressos",
            headers={"Authorization": f"Bearer {u1_token}"},
        )
        ing_id = buy_res.json()["id"]

        # U1 acessa o seu ingresso -> 200
        res_u1 = await client.get(
            f"/ingressos/{ing_id}",
            headers={"Authorization": f"Bearer {u1_token}"},
        )
        assert res_u1.status_code == 200
        assert res_u1.json()["id"] == ing_id

        # U2 tenta acessar o ingresso de U1 -> 404 (para não revelar ids)
        res_u2 = await client.get(
            f"/ingressos/{ing_id}",
            headers={"Authorization": f"Bearer {u2_token}"},
        )
        assert res_u2.status_code == 404
        assert res_u2.json()["detail"] == "Ingresso não encontrado"


# 10. queue.publicar_ingresso lançando exceção -> Compra continua 201, ingresso PENDING, erro logado
@pytest.mark.asyncio
async def test_falha_na_fila_sns_mantem_compra_201():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, org_token = await criar_usuario_e_token(
            client, "org@test.com", papel="organizer"
        )
        _, user_token = await criar_usuario_e_token(client, "u1@test.com")
        ev_id = await criar_evento_teste(client, org_token)

        # Mock para simular falha no envio para o SNS
        with patch(
            "src.ingresso.service.publicar_ingresso",
            side_effect=RuntimeError("SNS indisponivel"),
        ):
            res = await client.post(
                f"/eventos/{ev_id}/ingressos",
                headers={"Authorization": f"Bearer {user_token}"},
            )
            assert res.status_code == 201
            assert res.json()["status"] == "PENDING"

        # Confere que o ingresso foi gravado no banco
        async with TestSessionLocal() as session:
            count = (
                await session.execute(
                    text("SELECT count(*) FROM ingressos WHERE evento_id = :id"),
                    {"id": ev_id},
                )
            ).scalar()
            assert count == 1


# 11. UPDATE manual deixando estoque negativo no psql -> Banco recusa (ck_eventos_estoque)
@pytest.mark.asyncio
async def test_constraint_ck_eventos_estoque_no_banco():
    async with TestSessionLocal() as session:
        # Tenta forçar estoque negativo diretamente
        with pytest.raises(IntegrityError):
            await session.execute(
                text("""
                INSERT INTO eventos (organizador_id, nome, local, data, total_ingressos, ingressos_disponiveis)
                VALUES (1, 'Evento Negativo', 'Local', now() + INTERVAL '1 day', 10, -1);
            """)
            )
            await session.commit()
