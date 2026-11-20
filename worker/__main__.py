import asyncio
from datetime import datetime, timedelta, timezone
import logging
import signal
import sys
from typing import Optional
import aio_pika
from aio_pika import DeliveryMode, Message
from sqlalchemy import select

from src.core.action_log import ensure_dynamodb_table
from src.core.models import Ingresso, StatusIngresso
from src.core.queue import (
    ROUTING_KEY_PURCHASED,
    declare_rabbitmq_topology,
    publicar_ingresso,
)
from src.core.settings import settings
from worker.handler import (
    extrair_id,
    extrair_id_seguro,
    get_worker_session_maker,
    marcar_failed,
    processar,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
)
logger = logging.getLogger("ticketz.worker")


async def reconciliar_ingressos_orfaos() -> int:
    """Busca ingressos PENDING com mais de 5 minutos de criação e os republica no RabbitMQ."""
    limite_tempo = datetime.now(timezone.utc) - timedelta(minutes=5)
    session_maker = get_worker_session_maker()
    async with session_maker() as session:
        stmt = (
            select(Ingresso.id)
            .where(
                Ingresso.status == StatusIngresso.PENDING,
                Ingresso.criado_em <= limite_tempo,
            )
            .limit(50)
        )
        res = await session.execute(stmt)
        ingressos_orfaos = res.scalars().all()

    if ingressos_orfaos:
        logger.info(
            "Reconciliação: encontrados %s ingressos PENDING antigos. Republicando...",
            len(ingressos_orfaos),
        )
        for ing_id in ingressos_orfaos:
            try:
                await publicar_ingresso(ing_id)
            except Exception as e:
                logger.warning(
                    "Falha ao republicar ingresso #%s na reconciliação: %s",
                    ing_id,
                    e,
                )

    return len(ingressos_orfaos)


async def tarefa_reconciliacao(parar: asyncio.Event) -> None:
    """Tarefa em segundo plano periódica para reconciliação a cada 5 minutos."""
    while not parar.is_set():
        try:
            await reconciliar_ingressos_orfaos()
            try:
                await asyncio.wait_for(parar.wait(), timeout=300.0)
                break
            except asyncio.TimeoutError:
                pass
        except Exception as e:
            logger.error("Erro na rotina de reconciliação: %s", e)
            await asyncio.sleep(5)


async def loop_worker(
    parar: asyncio.Event, max_iterations: Optional[int] = None
) -> None:
    """Loop principal do worker consumindo do RabbitMQ com retry controlado e DLQ."""
    await ensure_dynamodb_table()

    max_tentativas = settings.RABBITMQ_MAX_RETRIES
    iteracoes = 0

    logger.info(
        "Worker Ticketz iniciado. Escutando fila RabbitMQ: %s",
        settings.RABBITMQ_QUEUE,
    )

    while not parar.is_set():
        if max_iterations is not None and iteracoes >= max_iterations:
            logger.info(
                "Limite de iterações atingido (%s). Finalizando loop.",
                max_iterations,
            )
            break

        iteracoes += 1

        try:
            connection = await aio_pika.connect_robust(
                settings.RABBITMQ_URL, timeout=5.0
            )
            async with connection:
                channel = await connection.channel()
                await channel.set_qos(prefetch_count=5)
                exchange, queue, _, _ = await declare_rabbitmq_topology(channel)

                mensagens_lidas = 0
                for _ in range(5):
                    msg = await queue.get(no_ack=False, fail=False, timeout=1.0)
                    if msg is None:
                        break
                    mensagens_lidas += 1

                    body = msg.body.decode("utf-8")
                    headers = msg.headers or {}
                    tentativa = int(headers.get("x-attempt", 1))

                    try:
                        ingresso_id = extrair_id(body)
                        await processar(ingresso_id)
                        await msg.ack()
                    except Exception as e:
                        logger.exception(
                            "Falha ao processar mensagem (tentativa %s/%s): %s",
                            tentativa,
                            max_tentativas,
                            e,
                        )
                        if tentativa >= max_tentativas:
                            id_seguro = extrair_id_seguro(body)
                            if id_seguro is not None:
                                await marcar_failed(id_seguro)
                                logger.warning(
                                    "Ingresso #%s atingiu limite de %s tentativas e foi marcado como FAILED.",
                                    id_seguro,
                                    max_tentativas,
                                )
                            # Envia para a DLQ rejeitando sem requeue
                            await msg.reject(requeue=False)
                        else:
                            # Republica com contador de tentativas incrementado
                            nova_msg = Message(
                                body=msg.body,
                                content_type="application/json",
                                delivery_mode=DeliveryMode.PERSISTENT,
                                headers={"x-attempt": tentativa + 1},
                            )
                            await exchange.publish(
                                nova_msg, routing_key=ROUTING_KEY_PURCHASED
                            )
                            await msg.ack()

                if mensagens_lidas == 0 and max_iterations is None:
                    try:
                        await asyncio.wait_for(parar.wait(), timeout=1.0)
                    except asyncio.TimeoutError:
                        pass

        except Exception as e:
            logger.exception(
                "Falha ao comunicar com RabbitMQ: %s. Aguardando 5s...", e
            )
            if max_iterations is not None:
                break
            await asyncio.sleep(5)


async def main() -> None:
    parar = asyncio.Event()
    loop = asyncio.get_running_loop()

    def _interromper():
        logger.info(
            "Sinal recebido. Finalizando o processamento da mensagem atual e encerrando..."
        )
        parar.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _interromper)
        except NotImplementedError:
            pass

    task_reconciliacao = asyncio.create_task(tarefa_reconciliacao(parar))
    task_worker = asyncio.create_task(loop_worker(parar))

    await task_worker
    task_reconciliacao.cancel()
    logger.info("Worker Ticketz encerrado com sucesso.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
