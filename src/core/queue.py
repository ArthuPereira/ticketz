import asyncio
import json
import logging
from src.core.aws import get_sns_client
from src.core.settings import settings

logger = logging.getLogger("ticketz.queue")


async def publicar_ingresso(ingresso_id: int) -> None:
    """Publica o ingresso_id no tópico SNS para processamento assíncrono pelo worker."""
    def _publish():
        sns = get_sns_client()
        mensagem = json.dumps({"ingresso_id": ingresso_id})
        return sns.publish(
            TopicArn=settings.SNS_TOPIC_ARN,
            Message=mensagem,
        )

    try:
        resp = await asyncio.to_thread(_publish)
        logger.info(
            "Ingresso %s publicado no SNS (MessageId: %s)",
            ingresso_id,
            resp.get("MessageId"),
        )
    except Exception as e:
        logger.error(
            "Falha ao publicar ingresso %s no tópico SNS (%s): %s",
            ingresso_id,
            settings.SNS_TOPIC_ARN,
            e,
        )
        raise
