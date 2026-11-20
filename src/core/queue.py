import json
import logging
import aio_pika
from aio_pika import DeliveryMode, ExchangeType, Message

from src.core.settings import settings

logger = logging.getLogger("ticketz.queue")

ROUTING_KEY_PURCHASED = "ticket.purchased"
ROUTING_KEY_DLQ = "ticket.dlq"


async def declare_rabbitmq_topology(channel: aio_pika.abc.AbstractChannel):
    """Declara de forma idempotente a exchange principal, a DLX, a fila principal e a DLQ."""
    dlx_name = f"{settings.RABBITMQ_EXCHANGE}.dlx"

    dlx = await channel.declare_exchange(
        dlx_name,
        ExchangeType.DIRECT,
        durable=True,
    )
    dlq = await channel.declare_queue(
        settings.RABBITMQ_DLQ,
        durable=True,
    )
    await dlq.bind(dlx, routing_key=ROUTING_KEY_DLQ)

    exchange = await channel.declare_exchange(
        settings.RABBITMQ_EXCHANGE,
        ExchangeType.DIRECT,
        durable=True,
    )
    queue = await channel.declare_queue(
        settings.RABBITMQ_QUEUE,
        durable=True,
        arguments={
            "x-dead-letter-exchange": dlx_name,
            "x-dead-letter-routing-key": ROUTING_KEY_DLQ,
        },
    )
    await queue.bind(exchange, routing_key=ROUTING_KEY_PURCHASED)

    return exchange, queue, dlx, dlq


async def publicar_ingresso(ingresso_id: int, attempt: int = 1) -> None:
    """Publica o ingresso_id na exchange do RabbitMQ para processamento assíncrono pelo worker."""
    try:
        connection = await aio_pika.connect_robust(settings.RABBITMQ_URL, timeout=5.0)
        async with connection:
            channel = await connection.channel()
            exchange, _, _, _ = await declare_rabbitmq_topology(channel)

            corpo = json.dumps({"ingresso_id": ingresso_id}).encode("utf-8")
            msg = Message(
                body=corpo,
                content_type="application/json",
                delivery_mode=DeliveryMode.PERSISTENT,
                headers={"x-attempt": attempt},
            )
            await exchange.publish(msg, routing_key=ROUTING_KEY_PURCHASED)

        logger.info(
            "Ingresso %s publicado no RabbitMQ (exchange=%s, tentativa=%s)",
            ingresso_id,
            settings.RABBITMQ_EXCHANGE,
            attempt,
        )
    except Exception as e:
        logger.error(
            "Falha ao publicar ingresso %s no RabbitMQ (%s): %s",
            ingresso_id,
            settings.RABBITMQ_EXCHANGE,
            e,
        )
        raise


async def purgar_filas() -> None:
    """Remove todas as mensagens pendentes da fila principal e da DLQ (utilizado em testes)."""
    try:
        connection = await aio_pika.connect_robust(settings.RABBITMQ_URL, timeout=3.0)
        async with connection:
            channel = await connection.channel()
            _, queue, _, dlq = await declare_rabbitmq_topology(channel)
            await queue.purge()
            await dlq.purge()
    except Exception as e:
        logger.debug("Não foi possível purgar filas do RabbitMQ: %s", e)


async def check_rabbitmq_ready() -> bool:
    """Verifica se o RabbitMQ está acessível."""
    try:
        connection = await aio_pika.connect_robust(settings.RABBITMQ_URL, timeout=2.0)
        async with connection:
            channel = await connection.channel()
            await declare_rabbitmq_topology(channel)
        return True
    except Exception as e:
        logger.warning("RabbitMQ health check falhou: %s", e)
        return False
