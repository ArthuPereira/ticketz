from datetime import datetime, timezone
import logging
from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.models import Evento, Ingresso
from src.core.queue import publicar_ingresso
from src.core.stubs import invalidar_cache, registrar_action_log
from src.ingresso.exceptions import ErroNegocio
from src.ingresso.schema import EventoResumo, IngressoResponse

logger = logging.getLogger("ticketz.ingresso.service")


async def comprar_ingresso(
    evento_id: int,
    usuario_id: int,
    db: AsyncSession,
) -> IngressoResponse:
    """Executa a transação atômica de compra de ingresso:
    1. Verifica evento (existência, ativo, data futura).
    2. Insere ingresso com ON CONFLICT (evita duplicação do mesmo usuário).
    3. Decrementa estoque atomicamente com UPDATE condicional (evita overbooking).
    4. Confirma transação com commit explícito.
    5. Notifica SNS, registra action_log e invalida cache."""

    # 1. SELECT evento (ativo, data)
    stmt_ev = select(Evento).where(Evento.id == evento_id)
    result_ev = await db.execute(stmt_ev)
    evento = result_ev.scalar_one_or_none()

    if evento is None or not evento.ativo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evento não encontrado",
        )

    agora = datetime.now(timezone.utc)
    if evento.data <= agora:
        raise ErroNegocio(
            codigo="EVENTO_ENCERRADO",
            mensagem="Evento já foi encerrado",
            status_code=status.HTTP_409_CONFLICT,
        )

    # 2. INSERT ingresso ... ON CONFLICT
    stmt_ins = (
        pg_insert(Ingresso)
        .values(evento_id=evento_id, usuario_id=usuario_id)
        .on_conflict_do_nothing(constraint="uq_ingressos_evento_usuario")
        .returning(Ingresso.id, Ingresso.status, Ingresso.criado_em, Ingresso.pronto_em)
    )
    result_ins = await db.execute(stmt_ins)
    ingresso_row = result_ins.mappings().first()

    if ingresso_row is None:
        await db.rollback()
        raise ErroNegocio(
            codigo="JA_POSSUI_INGRESSO",
            mensagem="Usuário já possui ingresso para este evento",
            status_code=status.HTTP_409_CONFLICT,
        )

    # 3. UPDATE eventos SET ingressos_disponiveis = ingressos_disponiveis - 1
    stmt_upd = (
        update(Evento)
        .where(
            Evento.id == evento_id,
            Evento.ativo.is_(True),
            Evento.ingressos_disponiveis > 0,
        )
        .values(
            ingressos_disponiveis=Evento.ingressos_disponiveis - 1,
            atualizado_em=agora,
        )
        .returning(Evento.ingressos_disponiveis)
    )
    disponiveis = (await db.execute(stmt_upd)).scalar_one_or_none()

    if disponiveis is None:
        # OBRIGATÓRIO: rollback para desfazer o INSERT do passo 2
        await db.rollback()
        raise ErroNegocio(
            codigo="ESGOTADO",
            mensagem="Ingressos esgotados",
            status_code=status.HTTP_409_CONFLICT,
        )

    # 4. COMMIT
    await db.commit()

    # 5. Ações pós-commit (fora da transação)
    ingresso_id = ingresso_row["id"]

    try:
        await publicar_ingresso(ingresso_id)
    except Exception as e:
        logger.error(
            "Falha ao publicar ingresso %s no SNS (compra mantida): %s",
            ingresso_id,
            e,
        )

    await registrar_action_log(
        action="CREATE_TICKET",
        resource="ingresso",
        resource_id=ingresso_id,
        data={
            "evento_id": evento_id,
            "usuario_id": usuario_id,
            "ingresso_id": ingresso_id,
        },
    )

    await invalidar_cache(f"evento:{evento_id}")

    return IngressoResponse(
        id=ingresso_id,
        status=ingresso_row["status"],
        criado_em=ingresso_row["criado_em"],
        pronto_em=ingresso_row["pronto_em"],
        evento=EventoResumo(
            id=evento.id,
            nome=evento.nome,
            data=evento.data,
            local=evento.local,
        ),
    )
