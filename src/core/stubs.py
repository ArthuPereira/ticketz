import logging
from typing import Any, Optional
from src.core.action_log import registrar_log
from src.core.cache import invalidar_evento, incrementar_versao_lista

logger = logging.getLogger("ticketz.stubs")


async def registrar_action_log(
    action: str,
    resource: str,
    resource_id: int | str,
    data: Optional[dict[str, Any]] = None,
    usuario_id: Optional[int] = None,
) -> None:
    """Encaminha para a persistência real de logs no DynamoDB."""
    entidade = f"{resource}#{resource_id}"
    await registrar_log(
        entidade=entidade,
        acao=action,
        usuario_id=usuario_id,
        dados=data,
    )


async def invalidar_cache(*keys: str) -> None:
    """Encaminha invalidações de cache para o Redis."""
    for k in keys:
        if k.startswith("evento:"):
            try:
                ev_id = int(k.split(":")[1])
                await invalidar_evento(ev_id)
            except (ValueError, IndexError):
                pass
        elif k.startswith("evento_"):
            try:
                ev_id = int(k.split("_")[1])
                await invalidar_evento(ev_id)
            except (ValueError, IndexError):
                pass
        elif "lista" in k:
            await incrementar_versao_lista()
