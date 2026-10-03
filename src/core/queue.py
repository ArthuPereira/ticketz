import logging

logger = logging.getLogger("ticketz.queue")


async def publicar_ingresso(ingresso_id: int) -> None:
    """Stub para a Etapa 6 (SNS). Publica mensagem no tópico SNS."""
    logger.info("[STUB SNS] Mensagem publicada para ingresso_id: %s", ingresso_id)
