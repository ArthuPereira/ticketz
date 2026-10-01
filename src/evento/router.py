from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from src.evento.schema import EventoResponse, EventoCreate
from src.core.models import Evento
from src.core.database import get_db

router = APIRouter(
    prefix="/eventos",
    tags=["Eventos"]
)

@router.post("/", response_model=EventoResponse, status_code=status.HTTP_201_CREATED)
async def criar_evento(evento_in: EventoCreate, db: AsyncSession = Depends(get_db)):
    novo_evento = Evento(**evento_in.model_dump())

    db.add(novo_evento)

    await db.commit()

    await db.refresh(novo_evento)

    return novo_evento
