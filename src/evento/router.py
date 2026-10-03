from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import require_organizer
from src.core.database import get_db
from src.core.models import Evento, Usuario
from src.core.stubs import invalidar_cache, registrar_action_log
from src.evento.dependencies import get_evento_do_organizador
from src.evento.schema import EventoCreate, EventoPagina, EventoResponse, EventoUpdate

router = APIRouter(
    prefix="/eventos",
    tags=["Eventos"],
)


@router.post(
    "",
    response_model=EventoResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar novo evento (apenas organizadores)",
)
async def criar_evento(
    evento_in: EventoCreate,
    current_user: Annotated[Usuario, Depends(require_organizer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Cria um novo evento atribuindo o organizador_id do token autenticado
    e definindo ingressos_disponiveis igual a total_ingressos."""
    novo_evento = Evento(
        organizador_id=current_user.id,
        nome=evento_in.nome,
        descricao=evento_in.descricao,
        local=evento_in.local,
        data=evento_in.data,
        total_ingressos=evento_in.total_ingressos,
        ingressos_disponiveis=evento_in.total_ingressos,
        banner_key=evento_in.banner_key,
        ativo=True,
    )

    db.add(novo_evento)
    await db.commit()
    await db.refresh(novo_evento)

    # [Etapa 5 - Stubs]: Log de auditoria e invalidação de cache
    await registrar_action_log(
        action="CREATE_EVENT",
        resource="evento",
        resource_id=novo_evento.id,
        data={
            "nome": novo_evento.nome,
            "organizador_id": novo_evento.organizador_id,
            "total_ingressos": novo_evento.total_ingressos,
            "data": novo_evento.data.isoformat(),
        },
    )
    await invalidar_cache("eventos_lista")

    return novo_evento


@router.get(
    "",
    response_model=EventoPagina,
    status_code=status.HTTP_200_OK,
    summary="Listar eventos públicos (apenas ativos e futuros)",
)
async def listar_eventos(
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100, description="Máximo de itens")] = 20,
    offset: Annotated[int, Query(ge=0, description="Deslocamento inicial")] = 0,
):
    """Vitrine pública: retorna eventos ativos com data futura, ordenados por data e id."""
    condicoes = [
        Evento.ativo.is_(True),
        Evento.data > func.now(),
    ]

    total_stmt = select(func.count(Evento.id)).where(*condicoes)
    total = await db.scalar(total_stmt) or 0

    query = (
        select(Evento)
        .where(*condicoes)
        .order_by(Evento.data.asc(), Evento.id.asc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.scalars(query)
    items = list(result.all())

    return EventoPagina(items=items, total=total, limit=limit, offset=offset)


@router.get(
    "/meus",
    response_model=EventoPagina,
    status_code=status.HTTP_200_OK,
    summary="Listar eventos do organizador logado",
)
async def listar_meus_eventos(
    current_user: Annotated[Usuario, Depends(require_organizer)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100, description="Máximo de itens")] = 20,
    offset: Annotated[int, Query(ge=0, description="Deslocamento inicial")] = 0,
):
    """Histórico do organizador: retorna todos os seus eventos ativos (inclusive passados)."""
    condicoes = [
        Evento.organizador_id == current_user.id,
        Evento.ativo.is_(True),
    ]

    total_stmt = select(func.count(Evento.id)).where(*condicoes)
    total = await db.scalar(total_stmt) or 0

    query = (
        select(Evento)
        .where(*condicoes)
        .order_by(Evento.data.asc(), Evento.id.asc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.scalars(query)
    items = list(result.all())

    return EventoPagina(items=items, total=total, limit=limit, offset=offset)


@router.get(
    "/{id}",
    response_model=EventoResponse,
    status_code=status.HTTP_200_OK,
    summary="Obter detalhes de um evento",
)
async def obter_evento(
    id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Retorna detalhes de um evento ativo pelo ID. Eventos inativos retornam 404."""
    stmt = select(Evento).where(Evento.id == id, Evento.ativo.is_(True))
    result = await db.execute(stmt)
    evento = result.scalar_one_or_none()

    if evento is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evento não encontrado",
        )

    return evento


@router.put(
    "/{id}",
    response_model=EventoResponse,
    status_code=status.HTTP_200_OK,
    summary="Atualizar evento (apenas dono do evento)",
)
async def atualizar_evento(
    evento_in: EventoUpdate,
    evento: Annotated[Evento, Depends(get_evento_do_organizador)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Atualização parcial do evento. Não permite alterar total_ingressos na v1."""
    campos_atualizar = evento_in.model_dump(exclude_unset=True)

    dados_anteriores = {k: getattr(evento, k) for k in campos_atualizar.keys()}
    for campo, valor in campos_atualizar.items():
        setattr(evento, campo, valor)

    evento.atualizado_em = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(evento)

    dados_novos = {k: getattr(evento, k) for k in campos_atualizar.keys()}

    # [Etapa 5 - Stubs]: Log de auditoria e invalidação de cache
    await registrar_action_log(
        action="UPDATE_EVENT",
        resource="evento",
        resource_id=evento.id,
        data={"antes": dados_anteriores, "depois": dados_novos},
    )
    await invalidar_cache("eventos_lista", f"evento_{evento.id}")

    return evento


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remover evento (soft delete pelo dono)",
)
async def deletar_evento(
    evento: Annotated[Evento, Depends(get_evento_do_organizador)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Soft delete do evento: marca ativo=False para preservar ingressos já emitidos."""
    evento.ativo = False
    evento.atualizado_em = datetime.now(timezone.utc)

    await db.commit()

    # [Etapa 5 - Stubs]: Log de auditoria e invalidação de cache
    await registrar_action_log(
        action="DELETE_EVENT",
        resource="evento",
        resource_id=evento.id,
        data={"nome": evento.nome, "organizador_id": evento.organizador_id},
    )
    await invalidar_cache("eventos_lista", f"evento_{evento.id}")

    return Response(status_code=status.HTTP_204_NO_CONTENT)
