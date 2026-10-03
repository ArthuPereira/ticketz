from typing import Annotated

from fastapi import Depends, HTTPException, Path, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.dependencies import require_organizer
from src.core.database import get_db
from src.core.models import Evento, Usuario


async def get_evento_do_organizador(
    id: Annotated[int, Path(description="ID do evento")],
    current_user: Annotated[Usuario, Depends(require_organizer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Evento:
    """Carrega o evento, devolve 404 se inexistente ou inativo, e 403 se o usuário logado não for o dono."""
    stmt = select(Evento).where(Evento.id == id)
    result = await db.execute(stmt)
    evento = result.scalar_one_or_none()

    # Eventos inexistentes ou com soft delete (ativo=False) respondem 404
    if evento is None or not evento.ativo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evento não encontrado",
        )

    # Evento existe e está ativo, mas pertence a outro organizador -> 403
    if evento.organizador_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito ao organizador do evento",
        )

    return evento
