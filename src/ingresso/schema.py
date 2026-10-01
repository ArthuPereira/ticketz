from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from src.core.models import StatusIngresso


class IngressoBase(BaseModel):
    evento_id: int = Field(..., description="ID do evento associado")
    usuario_id: int = Field(..., description="ID do usuário comprador")


class IngressoCreate(IngressoBase):
    status: StatusIngresso = Field(
        default=StatusIngresso.PENDING,
        description="Status inicial do ingresso",
    )


class IngressoUpdate(BaseModel):
    status: Optional[StatusIngresso] = None
    pdf_key: Optional[str] = Field(None, max_length=255)
    pronto_em: Optional[datetime] = None


class IngressoResponse(IngressoBase):
    id: int
    status: StatusIngresso
    codigo: UUID
    pdf_key: Optional[str] = None
    criado_em: datetime
    pronto_em: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
