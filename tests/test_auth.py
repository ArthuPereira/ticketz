import pytest
from typing import Annotated
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from fastapi import Depends

from src.core.settings import settings
from src.core.database import get_db
from src.core.models import Usuario
from src.auth.dependencies import require_organizer
from src.main import app

# Engine de teste com NullPool para não reter conexões asyncpg entre event loops do pytest
test_engine = create_async_engine(settings.database_url, poolclass=NullPool)
TestSessionLocal = async_sessionmaker(bind=test_engine, class_=AsyncSession, expire_on_commit=False)


async def override_get_db():
    async with TestSessionLocal() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db


# Rota temporária de teste para validar require_organizer
@app.get("/test-organizer-only")
async def dummy_organizer_endpoint(organizador: Annotated[Usuario, Depends(require_organizer)]):
    return {"message": "Bem-vindo organizador", "id": organizador.id}


@pytest.fixture(autouse=True)
async def clean_database():
    """Limpa as tabelas antes e depois de cada teste para garantir isolamento."""
    async with TestSessionLocal() as session:
        await session.execute(text("TRUNCATE TABLE ingressos, eventos, usuarios RESTART IDENTITY CASCADE;"))
        await session.commit()
    yield
    async with TestSessionLocal() as session:
        await session.execute(text("TRUNCATE TABLE ingressos, eventos, usuarios RESTART IDENTITY CASCADE;"))
        await session.commit()


@pytest.mark.asyncio
async def test_register_success_user():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "nome": "Ana",
            "email": "ana@x.com",
            "senha": "minimo8chars",
            "papel": "user",
        }
        response = await client.post("/auth/register", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["id"] == 1
        assert data["nome"] == "Ana"
        assert data["email"] == "ana@x.com"
        assert data["papel"] == "user"
        assert "senha" not in data
        assert "senha_hash" not in data


@pytest.mark.asyncio
async def test_register_success_organizer():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "nome": "Carlos Organizador",
            "email": "carlos@eventos.com",
            "senha": "senhaforte123",
            "papel": "organizer",
        }
        response = await client.post("/auth/register", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["papel"] == "organizer"


@pytest.mark.asyncio
async def test_register_duplicate_email():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        payload = {
            "nome": "Ana",
            "email": "ana@x.com",
            "senha": "minimo8chars",
            "papel": "user",
        }
        resp1 = await client.post("/auth/register", json=payload)
        assert resp1.status_code == 201

        # Mesma conta com caixa alta e espaços
        payload_dup = {
            "nome": "Ana Silva",
            "email": "  ANA@x.com  ",
            "senha": "outrasenha123",
            "papel": "user",
        }
        resp2 = await client.post("/auth/register", json=payload_dup)
        assert resp2.status_code == 409
        assert resp2.json()["detail"] == "E-mail já cadastrado"


@pytest.mark.asyncio
async def test_register_validation_errors():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Senha curta (< 8 chars)
        r_short_pass = await client.post(
            "/auth/register",
            json={"nome": "A", "email": "a@x.com", "senha": "123", "papel": "user"},
        )
        assert r_short_pass.status_code == 422

        # E-mail inválido
        r_bad_email = await client.post(
            "/auth/register",
            json={"nome": "A", "email": "not-an-email", "senha": "minimo8chars", "papel": "user"},
        )
        assert r_bad_email.status_code == 422

        # Papel fora de user/organizer
        r_bad_role = await client.post(
            "/auth/register",
            json={"nome": "A", "email": "a@x.com", "senha": "minimo8chars", "papel": "admin"},
        )
        assert r_bad_role.status_code == 422


@pytest.mark.asyncio
async def test_login_json_and_form():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Cadastra
        await client.post(
            "/auth/register",
            json={"nome": "Ana", "email": "ana@x.com", "senha": "minimo8chars", "papel": "user"},
        )

        # Login com JSON ({email, senha})
        resp_json = await client.post(
            "/auth/login",
            json={"email": "ANA@x.com", "senha": "minimo8chars"},
        )
        assert resp_json.status_code == 200
        token_data = resp_json.json()
        assert "access_token" in token_data
        assert token_data["token_type"] == "bearer"

        # Login com Form Data (Swagger UI format)
        resp_form = await client.post(
            "/auth/login",
            data={"username": "ana@x.com", "password": "minimo8chars"},
        )
        assert resp_form.status_code == 200
        assert "access_token" in resp_form.json()


@pytest.mark.asyncio
async def test_login_invalid_credentials():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post(
            "/auth/register",
            json={"nome": "Ana", "email": "ana@x.com", "senha": "minimo8chars", "papel": "user"},
        )

        # Senha errada
        resp_wrong_pass = await client.post(
            "/auth/login",
            json={"email": "ana@x.com", "senha": "senhaincorreta"},
        )
        assert resp_wrong_pass.status_code == 401
        assert resp_wrong_pass.json()["detail"] == "Credenciais inválidas"

        # E-mail inexistente (mesma mensagem)
        resp_wrong_email = await client.post(
            "/auth/login",
            json={"email": "naoexiste@x.com", "senha": "minimo8chars"},
        )
        assert resp_wrong_email.status_code == 401
        assert resp_wrong_email.json()["detail"] == "Credenciais inválidas"


@pytest.mark.asyncio
async def test_auth_me():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Cadastra e faz login
        await client.post(
            "/auth/register",
            json={"nome": "Ana", "email": "ana@x.com", "senha": "minimo8chars", "papel": "user"},
        )
        login_res = await client.post(
            "/auth/login",
            json={"email": "ana@x.com", "senha": "minimo8chars"},
        )
        token = login_res.json()["access_token"]

        # GET /auth/me sem token
        resp_no_token = await client.get("/auth/me")
        assert resp_no_token.status_code == 401

        # GET /auth/me com token
        resp_me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp_me.status_code == 200
        user_info = resp_me.json()
        assert user_info["id"] == 1
        assert user_info["nome"] == "Ana"
        assert user_info["email"] == "ana@x.com"
        assert user_info["papel"] == "user"


@pytest.mark.asyncio
async def test_require_organizer():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Cadastra user normal
        await client.post(
            "/auth/register",
            json={"nome": "Ana User", "email": "ana_user@x.com", "senha": "minimo8chars", "papel": "user"},
        )
        login_user = await client.post(
            "/auth/login",
            json={"email": "ana_user@x.com", "senha": "minimo8chars"},
        )
        token_user = login_user.json()["access_token"]

        # Tenta acessar rota restrita a organizador com token de user normal -> 403 Forbidden
        resp_forbidden = await client.get(
            "/test-organizer-only",
            headers={"Authorization": f"Bearer {token_user}"},
        )
        assert resp_forbidden.status_code == 403
        assert resp_forbidden.json()["detail"] == "Acesso restrito a organizadores"

        # Cadastra organizer
        await client.post(
            "/auth/register",
            json={"nome": "Beto Org", "email": "beto_org@x.com", "senha": "minimo8chars", "papel": "organizer"},
        )
        login_org = await client.post(
            "/auth/login",
            json={"email": "beto_org@x.com", "senha": "minimo8chars"},
        )
        token_org = login_org.json()["access_token"]

        # Acessa rota restrita com token de organizer -> 200 OK
        resp_ok = await client.get(
            "/test-organizer-only",
            headers={"Authorization": f"Bearer {token_org}"},
        )
        assert resp_ok.status_code == 200
        assert resp_ok.json()["message"] == "Bem-vindo organizador"
