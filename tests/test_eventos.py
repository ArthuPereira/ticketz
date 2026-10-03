from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from src.core.database import get_db
from src.core.models import Ingresso, StatusIngresso
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
    """Garante tabelas limpas para cada teste."""
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
    papel: str = "organizer",
    nome: str = "Org Teste",
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


# 1. Criar evento como user -> 403
@pytest.mark.asyncio
async def test_criar_evento_como_user_retorna_403():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, user_token = await criar_usuario_e_token(
            client, "user@test.com", papel="user"
        )
        data_futura = (
            datetime.now(timezone.utc) + timedelta(days=10)
        ).isoformat()
        payload = {
            "nome": "Show",
            "local": "Arena",
            "data": data_futura,
            "total_ingressos": 100,
        }
        res = await client.post(
            "/eventos",
            json=payload,
            headers={"Authorization": f"Bearer {user_token}"},
        )
        assert res.status_code == 403
        assert res.json()["detail"] == "Acesso restrito a organizadores"


# 2. Criar sem token -> 401
@pytest.mark.asyncio
async def test_criar_evento_sem_token_retorna_401():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        data_futura = (
            datetime.now(timezone.utc) + timedelta(days=10)
        ).isoformat()
        payload = {
            "nome": "Show",
            "local": "Arena",
            "data": data_futura,
            "total_ingressos": 100,
        }
        res = await client.post("/eventos", json=payload)
        assert res.status_code == 401


# 3. Criar com data no passado -> 422
@pytest.mark.asyncio
async def test_criar_evento_data_passado_retorna_422():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, org_token = await criar_usuario_e_token(
            client, "org@test.com", papel="organizer"
        )
        payload = {
            "nome": "Show",
            "local": "Arena",
            "data": "2020-01-01T20:00:00Z",
            "total_ingressos": 100,
        }
        res = await client.post(
            "/eventos",
            json=payload,
            headers={"Authorization": f"Bearer {org_token}"},
        )
        assert res.status_code == 422


# 4. Criar com data sem fuso (2026-12-01T20:00:00) -> 422
@pytest.mark.asyncio
async def test_criar_evento_data_sem_fuso_retorna_422():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, org_token = await criar_usuario_e_token(
            client, "org@test.com", papel="organizer"
        )
        payload = {
            "nome": "Show",
            "local": "Arena",
            "data": "2027-12-01T20:00:00",  # Sem fuso horário (ex: sem Z ou +00:00)
            "total_ingressos": 100,
        }
        res = await client.post(
            "/eventos",
            json=payload,
            headers={"Authorization": f"Bearer {org_token}"},
        )
        assert res.status_code == 422


# 5. Criar com total_ingressos 0 ou negativo -> 422
@pytest.mark.asyncio
async def test_criar_evento_total_ingressos_invalido_retorna_422():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, org_token = await criar_usuario_e_token(
            client, "org@test.com", papel="organizer"
        )
        data_futura = (
            datetime.now(timezone.utc) + timedelta(days=10)
        ).isoformat()

        # Zero
        res0 = await client.post(
            "/eventos",
            json={
                "nome": "Show",
                "local": "Arena",
                "data": data_futura,
                "total_ingressos": 0,
            },
            headers={"Authorization": f"Bearer {org_token}"},
        )
        assert res0.status_code == 422

        # Negativo
        res_neg = await client.post(
            "/eventos",
            json={
                "nome": "Show",
                "local": "Arena",
                "data": data_futura,
                "total_ingressos": -5,
            },
            headers={"Authorization": f"Bearer {org_token}"},
        )
        assert res_neg.status_code == 422


# 6 & 7. Criar enviando ingressos_disponiveis ou organizador_id no corpo (ignorados) e Criar com sucesso -> 201
@pytest.mark.asyncio
async def test_criar_evento_sucesso_e_campos_protegidos():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        org_id, org_token = await criar_usuario_e_token(
            client, "org@test.com", papel="organizer"
        )
        data_futura = (
            datetime.now(timezone.utc) + timedelta(days=10)
        ).isoformat()
        payload = {
            "nome": "Festival de Verão",
            "descricao": "Grande festival",
            "local": "Praia de Iracema",
            "data": data_futura,
            "total_ingressos": 500,
            # Tentativa de burlar organizador_id e estoque:
            "organizador_id": 9999,
            "ingressos_disponiveis": 10,
        }
        res = await client.post(
            "/eventos",
            json=payload,
            headers={"Authorization": f"Bearer {org_token}"},
        )
        assert res.status_code == 201
        data = res.json()
        assert data["id"] == 1
        assert data["nome"] == "Festival de Verão"
        assert (
            data["organizador_id"] == org_id
        )  # Veio do token, NÃO do 9999 enviado
        assert (
            data["ingressos_disponiveis"] == 500
        )  # Igual a total_ingressos, NÃO 10
        assert data["total_ingressos"] == 500
        assert data["banner_url"] is None
        assert data["ativo"] is True


# 8. Listar com limit=1000 -> 422
@pytest.mark.asyncio
async def test_listar_eventos_limit_excessivo_retorna_422():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        res = await client.get("/eventos?limit=1000")
        assert res.status_code == 422


# 9. Paginar 25 eventos com limit=10 (3 páginas) -> sem repetição nem falta; total == 25
@pytest.mark.asyncio
async def test_paginacao_25_eventos():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, org_token = await criar_usuario_e_token(
            client, "org@test.com", papel="organizer"
        )

        # Cadastra 25 eventos
        for i in range(1, 26):
            data_evento = (
                datetime.now(timezone.utc) + timedelta(days=i)
            ).isoformat()
            await client.post(
                "/eventos",
                json={
                    "nome": f"Evento {i:02d}",
                    "local": "Local Teste",
                    "data": data_evento,
                    "total_ingressos": 100,
                },
                headers={"Authorization": f"Bearer {org_token}"},
            )

        # Página 1: offset=0, limit=10
        p1 = (await client.get("/eventos?limit=10&offset=0")).json()
        assert p1["total"] == 25
        assert len(p1["items"]) == 10
        ids_p1 = [e["id"] for e in p1["items"]]

        # Página 2: offset=10, limit=10
        p2 = (await client.get("/eventos?limit=10&offset=10")).json()
        assert p2["total"] == 25
        assert len(p2["items"]) == 10
        ids_p2 = [e["id"] for e in p2["items"]]

        # Página 3: offset=20, limit=10
        p3 = (await client.get("/eventos?limit=10&offset=20")).json()
        assert p3["total"] == 25
        assert len(p3["items"]) == 5
        ids_p3 = [e["id"] for e in p3["items"]]

        # Verifica que nenhum ID se repete e todos os 25 foram retornados
        todos_ids = ids_p1 + ids_p2 + ids_p3
        assert len(todos_ids) == 25
        assert len(set(todos_ids)) == 25


# 10. Evento passado na listagem pública -> não aparece; aparece em /eventos/meus
@pytest.mark.asyncio
async def test_evento_passado_nao_aparece_na_vitrine_publica():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        org_id, org_token = await criar_usuario_e_token(
            client, "org@test.com", papel="organizer"
        )

        # Evento futuro via API
        data_futura = (
            datetime.now(timezone.utc) + timedelta(days=5)
        ).isoformat()
        await client.post(
            "/eventos",
            json={
                "nome": "Evento Futuro",
                "local": "Local 1",
                "data": data_futura,
                "total_ingressos": 50,
            },
            headers={"Authorization": f"Bearer {org_token}"},
        )

        # Inserir evento passado diretamente no banco (já que a API bloqueia criação no passado)
        async with TestSessionLocal() as session:
            await session.execute(
                text("""
                INSERT INTO eventos (organizador_id, nome, local, data, total_ingressos, ingressos_disponiveis, ativo)
                VALUES (:org_id, 'Evento Passado', 'Local 2', now() - INTERVAL '2 days', 50, 50, true);
            """),
                {"org_id": org_id},
            )
            await session.commit()

        # Listagem pública: só o futuro deve aparecer
        pub_res = await client.get("/eventos")
        assert pub_res.status_code == 200
        pub_data = pub_res.json()
        assert pub_data["total"] == 1
        assert pub_data["items"][0]["nome"] == "Evento Futuro"

        # Listagem /eventos/meus do organizador: ambos devem aparecer
        meus_res = await client.get(
            "/eventos/meus", headers={"Authorization": f"Bearer {org_token}"}
        )
        assert meus_res.status_code == 200
        meus_data = meus_res.json()
        assert meus_data["total"] == 2


# 11. GET /eventos/meus -> não é confundido com /{id}
@pytest.mark.asyncio
async def test_get_eventos_meus_nao_confundido_com_id():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, org_token = await criar_usuario_e_token(
            client, "org@test.com", papel="organizer"
        )
        res = await client.get(
            "/eventos/meus", headers={"Authorization": f"Bearer {org_token}"}
        )
        assert res.status_code == 200
        assert "items" in res.json()
        assert "total" in res.json()


# 12. GET /eventos/9999 -> 404
@pytest.mark.asyncio
async def test_get_evento_inexistente_retorna_404():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        res = await client.get("/eventos/9999")
        assert res.status_code == 404
        assert res.json()["detail"] == "Evento não encontrado"


# 13. PUT por outro organizador -> 403
@pytest.mark.asyncio
async def test_put_evento_por_outro_organizador_retorna_403():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, org_token_1 = await criar_usuario_e_token(
            client, "org1@test.com", papel="organizer", nome="Org 1"
        )
        _, org_token_2 = await criar_usuario_e_token(
            client, "org2@test.com", papel="organizer", nome="Org 2"
        )

        data_futura = (
            datetime.now(timezone.utc) + timedelta(days=5)
        ).isoformat()
        create_res = await client.post(
            "/eventos",
            json={
                "nome": "Evento do Org 1",
                "local": "Local 1",
                "data": data_futura,
                "total_ingressos": 100,
            },
            headers={"Authorization": f"Bearer {org_token_1}"},
        )
        ev_id = create_res.json()["id"]

        # Org 2 tenta alterar o evento do Org 1
        put_res = await client.put(
            f"/eventos/{ev_id}",
            json={"nome": "Hackeado"},
            headers={"Authorization": f"Bearer {org_token_2}"},
        )
        assert put_res.status_code == 403
        assert (
            put_res.json()["detail"]
            == "Acesso restrito ao organizador do evento"
        )


# 14. PUT só com nome -> outros campos intactos, atualizado_em mudou
@pytest.mark.asyncio
async def test_put_parcial_apenas_nome():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, org_token = await criar_usuario_e_token(
            client, "org@test.com", papel="organizer"
        )
        data_futura = (
            datetime.now(timezone.utc) + timedelta(days=5)
        ).isoformat()
        create_res = await client.post(
            "/eventos",
            json={
                "nome": "Nome Original",
                "descricao": "Descricao Intacta",
                "local": "Local Intacto",
                "data": data_futura,
                "total_ingressos": 200,
            },
            headers={"Authorization": f"Bearer {org_token}"},
        )
        ev = create_res.json()
        ev_id = ev["id"]

        # Atualiza só o nome
        put_res = await client.put(
            f"/eventos/{ev_id}",
            json={"nome": "Nome Atualizado"},
            headers={"Authorization": f"Bearer {org_token}"},
        )
        assert put_res.status_code == 200
        ev_updated = put_res.json()
        assert ev_updated["nome"] == "Nome Atualizado"
        assert ev_updated["descricao"] == "Descricao Intacta"
        assert ev_updated["local"] == "Local Intacto"
        assert ev_updated["total_ingressos"] == 200
        assert ev_updated["atualizado_em"] >= ev["criado_em"]


# 15. PUT tentando enviar total_ingressos -> 422
@pytest.mark.asyncio
async def test_put_tentando_alterar_total_ingressos_retorna_422():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, org_token = await criar_usuario_e_token(
            client, "org@test.com", papel="organizer"
        )
        data_futura = (
            datetime.now(timezone.utc) + timedelta(days=5)
        ).isoformat()
        create_res = await client.post(
            "/eventos",
            json={
                "nome": "Show",
                "local": "Arena",
                "data": data_futura,
                "total_ingressos": 100,
            },
            headers={"Authorization": f"Bearer {org_token}"},
        )
        ev_id = create_res.json()["id"]

        put_res = await client.put(
            f"/eventos/{ev_id}",
            json={"total_ingressos": 500},
            headers={"Authorization": f"Bearer {org_token}"},
        )
        assert put_res.status_code == 422


# 16. DELETE pelo dono -> 204; some da listagem; GET devolve 404
@pytest.mark.asyncio
async def test_delete_pelo_dono_soft_delete():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, org_token = await criar_usuario_e_token(
            client, "org@test.com", papel="organizer"
        )
        data_futura = (
            datetime.now(timezone.utc) + timedelta(days=5)
        ).isoformat()
        create_res = await client.post(
            "/eventos",
            json={
                "nome": "Evento a Deletar",
                "local": "Local",
                "data": data_futura,
                "total_ingressos": 100,
            },
            headers={"Authorization": f"Bearer {org_token}"},
        )
        ev_id = create_res.json()["id"]

        del_res = await client.delete(
            f"/eventos/{ev_id}",
            headers={"Authorization": f"Bearer {org_token}"},
        )
        assert del_res.status_code == 204

        # GET direto devolve 404
        get_res = await client.get(f"/eventos/{ev_id}")
        assert get_res.status_code == 404

        # Some da vitrine pública
        list_res = await client.get("/eventos")
        assert list_res.json()["total"] == 0


# 17. DELETE de evento com ingressos vendidos -> 204 (soft delete); ingressos continuam existindo
@pytest.mark.asyncio
async def test_delete_evento_com_ingressos_vendidos():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        org_id, org_token = await criar_usuario_e_token(
            client, "org@test.com", papel="organizer"
        )
        data_futura = (
            datetime.now(timezone.utc) + timedelta(days=5)
        ).isoformat()
        create_res = await client.post(
            "/eventos",
            json={
                "nome": "Evento com Ingressos",
                "local": "Arena",
                "data": data_futura,
                "total_ingressos": 100,
            },
            headers={"Authorization": f"Bearer {org_token}"},
        )
        ev_id = create_res.json()["id"]

        # Cria um ingresso associado no banco
        async with TestSessionLocal() as session:
            ingresso = Ingresso(
                evento_id=ev_id,
                usuario_id=org_id,
                status=StatusIngresso.READY.value,
                pdf_key="ticket_pdf_123.pdf",
            )
            session.add(ingresso)
            await session.commit()

        # DELETE pelo dono deve responder 204 sem falhar por ForeignKey
        del_res = await client.delete(
            f"/eventos/{ev_id}",
            headers={"Authorization": f"Bearer {org_token}"},
        )
        assert del_res.status_code == 204

        # O ingresso continua existindo no banco
        async with TestSessionLocal() as session:
            res = await session.execute(
                text(
                    "SELECT COUNT(*) FROM ingressos WHERE evento_id = :ev_id"
                ),
                {"ev_id": ev_id},
            )
            count = res.scalar()
            assert count == 1


# 18. DELETE repetido -> 404
@pytest.mark.asyncio
async def test_delete_repetido_retorna_404():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        _, org_token = await criar_usuario_e_token(
            client, "org@test.com", papel="organizer"
        )
        data_futura = (
            datetime.now(timezone.utc) + timedelta(days=5)
        ).isoformat()
        create_res = await client.post(
            "/eventos",
            json={
                "nome": "Show",
                "local": "Arena",
                "data": data_futura,
                "total_ingressos": 100,
            },
            headers={"Authorization": f"Bearer {org_token}"},
        )
        ev_id = create_res.json()["id"]

        # Primeiro DELETE: 204
        r1 = await client.delete(
            f"/eventos/{ev_id}",
            headers={"Authorization": f"Bearer {org_token}"},
        )
        assert r1.status_code == 204

        # Segundo DELETE: 404 (já está inativo)
        r2 = await client.delete(
            f"/eventos/{ev_id}",
            headers={"Authorization": f"Bearer {org_token}"},
        )
        assert r2.status_code == 404
        assert r2.json()["detail"] == "Evento não encontrado"


# 19. GET /health com o banco parado -> 200
@pytest.mark.asyncio
async def test_health_check_sem_dependencias():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        res = await client.get("/health")
        assert res.status_code == 200
        assert res.json() == {"status": "ok"}

