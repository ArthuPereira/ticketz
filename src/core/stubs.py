import logging
from typing import Any

logger = logging.getLogger("ticketz.stubs")


async def registrar_action_log(
    action: str,
    resource: str,
    resource_id: int | str,
    data: dict[str, Any] | None = None,
) -> None:
    """Stub para a Etapa 5 (DynamoDB / CloudWatch). Registra ações de auditoria."""
    logger.info(
        "[STUB ACTION_LOG] Action: %s | Resource: %s | ID: %s | Data: %s",
        action,
        resource,
        resource_id,
        data,
    )


async def invalidar_cache(*keys: str) -> None:
    """Stub para a Etapa 5 (Redis). Invalida chaves de cache."""
    logger.info("[STUB CACHE_INVALIDATE] Chaves invalidadas: %s", keys)
