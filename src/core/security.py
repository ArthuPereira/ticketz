import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from src.core.settings import settings

# Configuração do hasher com Argon2 via pwdlib
password_hash = PasswordHash((Argon2Hasher(),))

# Hash falso fixo válido para uniformizar o tempo de resposta e evitar enumeração de usuários
DUMMY_HASH = "$argon2id$v=19$m=65536,t=3,p=4$jqGE6x405vgzUX+lUDj6qw$91Ynyf2CifRpkvuCamWA+0FrxQDouAHFl00/2ef+ZAI"


async def hash_password(password: str) -> str:
    """Gera hash de senha usando Argon2 em uma thread separada para não travar o event loop."""
    return await asyncio.to_thread(password_hash.hash, password)


async def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica a senha contra o hash usando Argon2 em thread separada."""
    try:
        return await asyncio.to_thread(password_hash.verify, plain_password, hashed_password)
    except Exception:
        return False


async def dummy_verify_password(plain_password: str) -> None:
    """Executa a verificação contra um hash fixo para consumir tempo de CPU similar,
    evitando ataques de timing/enumeração quando o usuário não existe no banco."""
    try:
        await asyncio.to_thread(password_hash.verify, plain_password, DUMMY_HASH)
    except Exception:
        pass


def create_access_token(user_id: int | str, expires_delta: Optional[timedelta] = None) -> str:
    """Cria um access token JWT contendo apenas sub (id como string), iat e exp."""
    now = datetime.now(timezone.utc)
    if expires_delta is not None:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    payload: dict[str, Any] = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }

    return jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_access_token(token: str) -> dict[str, Any]:
    """Decodifica e valida o JWT token usando a chave secreta e algoritmo configurados."""
    return jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[settings.JWT_ALGORITHM],
    )
