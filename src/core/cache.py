import asyncio
import json
import logging
from typing import Any, Awaitable, Callable, Optional, Tuple
import redis.asyncio as aioredis
from redis.exceptions import RedisError

from src.core.settings import settings

logger = logging.getLogger("ticketz.cache")

_redis_client: Optional[aioredis.Redis] = None
_client_loop: Optional[asyncio.AbstractEventLoop] = None


def get_redis_client() -> aioredis.Redis:
    """Retorna cliente único do Redis configurado com timeouts agressivos (0.5s).
    Re-instancia o cliente se o event loop for alterado (comum em suítes de testes)."""
    global _redis_client, _client_loop
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    if _redis_client is None or (_client_loop is not None and _client_loop != current_loop):
        _redis_client = aioredis.from_url(
            settings.redis_url,
            socket_timeout=0.5,
            socket_connect_timeout=0.5,
            decode_responses=True,
        )
        _client_loop = current_loop
    return _redis_client


async def close_redis_client() -> None:
    """Fecha a conexão do cliente Redis."""
    global _redis_client
    if _redis_client is not None:
        try:
            await _redis_client.aclose()
        except Exception as e:
            logger.warning("Erro ao fechar cliente Redis: %s", e)
        finally:
            _redis_client = None


async def get_or_set(
    chave: str,
    ttl: int,
    carregar: Callable[[], Awaitable[Any]],
) -> Tuple[Any, bool]:
    """Padrão cache-aside resiliente.
    Retorna uma tupla (valor, hit: bool).
    Se o Redis estiver fora do ar ou falhar, vai direto ao banco (miss) sem lançar 500."""
    redis = get_redis_client()
    try:
        bruto = await redis.get(chave)
        if bruto is not None:
            try:
                await redis.incr("cache:hits")
            except RedisError:
                pass
            return json.loads(bruto), True
    except RedisError as e:
        logger.warning("Redis indisponível na leitura de '%s': %s. Indo ao banco de dados.", chave, e)

    # Cache miss ou redis com erro: carrega do banco
    valor = await carregar()

    # Se o valor existe, grava no cache (não cacheia 404 / None)
    if valor is not None:
        try:
            await redis.set(chave, json.dumps(valor), ex=ttl)
            await redis.incr("cache:misses")
        except RedisError as e:
            logger.warning("Redis indisponível na escrita de '%s': %s.", chave, e)

    return valor, False


async def get_lista_versao() -> int:
    """Obtém a versão atual da lista de eventos para chaveamento de páginas."""
    redis = get_redis_client()
    try:
        v = await redis.get("eventos:lista:versao")
        if v is None:
            await redis.set("eventos:lista:versao", 1)
            return 1
        return int(v)
    except RedisError:
        return 1


async def incrementar_versao_lista() -> int:
    """Incrementa a versão da lista para invalidar todas as páginas sem necessidade de SCAN."""
    redis = get_redis_client()
    try:
        return await redis.incr("eventos:lista:versao")
    except RedisError as e:
        logger.warning("Falha ao incrementar versão da lista no Redis: %s", e)
        return 1


async def invalidar_evento(evento_id: int) -> None:
    """Invalida a chave de cache de um evento específico."""
    redis = get_redis_client()
    try:
        await redis.delete(f"evento:{evento_id}")
    except RedisError as e:
        logger.warning("Falha ao invalidar evento:%s no Redis: %s", evento_id, e)


async def invalidar_escrita_evento(evento_id: int) -> None:
    """Invalidação completa para alterações em eventos (PUT, DELETE, POST, Banner):
    apaga a chave individual e incrementa a versão da lista."""
    await invalidar_evento(evento_id)
    await incrementar_versao_lista()


async def get_cache_stats() -> dict[str, int]:
    """Retorna os contadores de hits e misses do cache."""
    redis = get_redis_client()
    try:
        hits = await redis.get("cache:hits")
        misses = await redis.get("cache:misses")
        return {
            "hits": int(hits) if hits else 0,
            "misses": int(misses) if misses else 0,
        }
    except RedisError:
        return {"hits": 0, "misses": 0}


async def check_redis_ready() -> bool:
    """Checa se o Redis responde ao ping dentro do timeout."""
    redis = get_redis_client()
    try:
        return bool(await redis.ping())
    except Exception:
        return False
