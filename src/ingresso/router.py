from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from src.auth.dependencies import get_current_user
from src.core.database import get_db
from src.core.models import Ingresso, Usuario
from src.ingresso.exceptions import ErroNegocio
from src.ingresso.schema import IngressoPagina, IngressoResponse
from src.ingresso.service import comprar_ingresso

router = APIRouter(tags=["Ingressos"])


@router.post(
    "/eventos/{id}/ingressos",
    response_model=IngressoResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Comprar/reservar ingresso para um evento",
)
async def post_comprar_ingresso(
    id: int,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Reserva um ingresso para o evento garantindo atomicidade e evitando venda acima do lote."""
    try:
        return await comprar_ingresso(
            evento_id=id,
            usuario_id=current_user.id,
            db=db,
        )
    except ErroNegocio as e:
        raise HTTPException(
            status_code=e.status_code,
            detail={"codigo": e.codigo, "mensagem": e.mensagem},
        )


@router.get(
    "/ingressos",
    response_model=IngressoPagina,
    status_code=status.HTTP_200_OK,
    summary="Listar ingressos do usuário logado",
)
async def listar_meus_ingressos(
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Annotated[int, Query(ge=1, le=100, description="Máximo de itens")] = 20,
    offset: Annotated[int, Query(ge=0, description="Deslocamento inicial")] = 0,
):
    """Retorna os ingressos do usuário logado ordenados pelos mais recentes primeiro.
    Inclui ingressos mesmo que o evento tenha sido posteriormente desativado."""
    total_stmt = select(func.count(Ingresso.id)).where(
        Ingresso.usuario_id == current_user.id
    )
    total = await db.scalar(total_stmt) or 0

    query = (
        select(Ingresso)
        .options(joinedload(Ingresso.evento))
        .where(Ingresso.usuario_id == current_user.id)
        .order_by(Ingresso.criado_em.desc(), Ingresso.id.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.scalars(query)
    items = list(result.all())

    return IngressoPagina(items=items, total=total, limit=limit, offset=offset)


@router.get(
    "/ingressos/{id}",
    response_model=IngressoResponse,
    status_code=status.HTTP_200_OK,
    summary="Obter detalhes de um ingresso do usuário",
)
async def obter_ingresso(
    id: int,
    current_user: Annotated[Usuario, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Retorna os detalhes de um ingresso do usuário logado.
    Responde 404 caso o ingresso não exista ou pertença a outro usuário."""
    stmt = (
        select(Ingresso)
        .options(joinedload(Ingresso.evento))
        .where(Ingresso.id == id, Ingresso.usuario_id == current_user.id)
    )
    result = await db.execute(stmt)
    ingresso = result.scalar_one_or_none()

    if ingresso is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ingresso não encontrado",
        )

    return ingresso
