import asyncio
from datetime import datetime, timedelta, timezone
import logging
import signal
import sys
from typing import Optional
from sqlalchemy import select

from src.core.aws import get_sqs_client
from src.core.database import AsyncSessionLocal
from src.core.models import Ingresso, StatusIngresso
from src.core.queue import publicar_ingresso
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
    """Busca ingressos PENDING com mais de 5 minutos de criação e os republica no SNS."""
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
                logger.warning("Falha ao republicar ingresso #%s na reconciliação: %s", ing_id, e)

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


async def loop_worker(parar: asyncio.Event, max_iterations: Optional[int] = None) -> None:
    """Loop principal do worker com long polling de 20s, processamento sequencial e shutdown limpo."""
    sqs = get_sqs_client()
    url = settings.SQS_QUEUE_URL
    max_tentativas = settings.SQS_MAX_RECEIVE_COUNT
    iteracoes = 0

    logger.info("Worker Ticketz iniciado. Escutando fila: %s", url)

    while not parar.is_set():
        if max_iterations is not None and iteracoes >= max_iterations:
            logger.info("Limite de iterações atingido (%s). Finalizando loop.", max_iterations)
            break

        iteracoes += 1

        try:
            def _receive():
                return sqs.receive_message(
                    QueueUrl=url,
                    MaxNumberOfMessages=5,
                    WaitTimeSeconds=20,
                    AttributeNames=["ApproximateReceiveCount"],
                )

            resp = await asyncio.to_thread(_receive)
        except Exception as e:
            logger.exception("Falha ao receber mensagens da fila SQS: %s. Aguardando 5s...", e)
            await asyncio.sleep(5)
            continue

        mensagens = resp.get("Messages", [])
        if not mensagens:
            continue

        for msg in mensagens:
            body = msg.get("Body", "")
            receipt_handle = msg.get("ReceiptHandle", "")
            attributes = msg.get("Attributes", {})
            tentativa = int(attributes.get("ApproximateReceiveCount", 1))

            try:
                ingresso_id = extrair_id(body)
                await processar(ingresso_id)

                # Sucesso: apaga a mensagem da fila SQS
                def _delete():
                    sqs.delete_message(QueueUrl=url, ReceiptHandle=receipt_handle)

                await asyncio.to_thread(_delete)
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
                # Não apaga: a mensagem reaparecerá após o visibility timeout ou irá para a DLQ


async def main() -> None:
    parar = asyncio.Event()
    loop = asyncio.get_running_loop()

    def _interromper():
        logger.info("Sinal recebido. Finalizando o processamento da mensagem atual e encerrando...")
        parar.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _interromper)
        except NotImplementedError:
            pass

    # Inicia a reconciliação e o loop principal
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
