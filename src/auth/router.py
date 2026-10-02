from typing import Annotated

from fastapi import APIRouter, Depends, Form, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import get_current_user
from src.auth.schema import RegisterIn, TokenOut, UsuarioOut
from src.core.database import get_db
from src.core.models import PapelUsuario, Usuario
from src.core.security import (
    create_access_token,
    dummy_verify_password,
    hash_password,
    verify_password,
)
from src.core.settings import settings

router = APIRouter(
    prefix="/auth",
    tags=["Autenticação"],
)


class OAuth2PasswordRequestFormOrJSON:
    """Suporta login via application/x-www-form-urlencoded (Swagger UI) e application/json."""

    def __init__(
        self,
        request: Request,
        grant_type: Annotated[str | None, Form()] = None,
        username: Annotated[str | None, Form()] = None,
        password: Annotated[str | None, Form()] = None,
        scope: Annotated[str, Form()] = "",
        client_id: Annotated[str | None, Form()] = None,
        client_secret: Annotated[str | None, Form()] = None,
    ):
        self.request = request
        self.grant_type = grant_type
        self.username = username
        self.password = password
        self.scopes = scope.split()
        self.client_id = client_id
        self.client_secret = client_secret

    async def get_credentials(self) -> tuple[str, str]:
        if self.username and self.password:
            return self.username, self.password

        content_type = self.request.headers.get("content-type", "")
        if "application/json" in content_type:
            try:
                body = await self.request.json()
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="JSON inválido no corpo da requisição",
                )
            u = body.get("email") or body.get("username")
            p = body.get("senha") or body.get("password")
            if u and p:
                return str(u), str(p)

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Credenciais não fornecidas ou formato inválido",
        )


@router.post(
    "/register",
    response_model=UsuarioOut,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastrar novo usuário",
)
async def register(
    register_in: RegisterIn,
    db: AsyncSession = Depends(get_db),
):
    """Cadastra um novo usuário no sistema. Valida e-mail, senha e papel."""
    email_normalizado = register_in.email.strip().lower()

    # Trava configurável para cadastro de organizadores
    if (
        register_in.papel == PapelUsuario.ORGANIZER
        and not settings.ALLOW_ORGANIZER_SIGNUP
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cadastro de organizadores desabilitado temporariamente",
        )

    # Checagem prévia no banco
    stmt = select(Usuario).where(func.lower(Usuario.email) == email_normalizado)
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="E-mail já cadastrado",
        )

    # Hash da senha usando Argon2 via threadpool
    senha_hash = await hash_password(register_in.senha)

    novo_usuario = Usuario(
        nome=register_in.nome.strip(),
        email=email_normalizado,
        senha_hash=senha_hash,
        papel=(
            register_in.papel.value
            if isinstance(register_in.papel, PapelUsuario)
            else str(register_in.papel)
        ),
    )

    db.add(novo_usuario)
    try:
        await db.commit()
        await db.refresh(novo_usuario)
    except IntegrityError:
        # Prevenção contra condição de corrida com o índice único uq_usuarios_email
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="E-mail já cadastrado",
        )

    # [Etapa 5 - Action Log]: Ponto de integração para registrar log de auditoria
    # CREATE / usuario / {novo_usuario.id} com dados: {"email": novo_usuario.email, "papel": novo_usuario.papel}

    return novo_usuario


@router.post(
    "/login",
    response_model=TokenOut,
    status_code=status.HTTP_200_OK,
    summary="Realizar login e obter JWT",
)
async def login(
    form_data: Annotated[OAuth2PasswordRequestFormOrJSON, Depends()],
    db: AsyncSession = Depends(get_db),
):
    """Autentica o usuário e retorna o token de acesso JWT (duração de 8 horas)."""
    username, password = await form_data.get_credentials()
    email_normalizado = username.strip().lower()

    stmt = select(Usuario).where(func.lower(Usuario.email) == email_normalizado)
    user = (await db.execute(stmt)).scalar_one_or_none()

    # Prevenção contra enumeração por tempo de resposta
    if user is None:
        await dummy_verify_password(password)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas",
            headers={"WWW-Authenticate": "Bearer"},
        )

    senha_valida = await verify_password(password, user.senha_hash)
    if not senha_valida:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Emite o token JWT contendo apenas sub, iat e exp
    access_token = create_access_token(user_id=user.id)

    # [Etapa 5 - Action Log]: Ponto de integração para registrar log de LOGIN
    # LOGIN / usuario / {user.id}

    return TokenOut(access_token=access_token, token_type="bearer")


@router.get(
    "/me",
    response_model=UsuarioOut,
    status_code=status.HTTP_200_OK,
    summary="Obter dados do usuário logado",
)
async def me(
    current_user: Annotated[Usuario, Depends(get_current_user)],
):
    """Retorna os dados do usuário autenticado a partir do token JWT."""
    return current_user
