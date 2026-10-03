from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from src.core.models import StatusIngresso


class EventoResumo(BaseModel):
    id: int
    nome: str
    data: datetime
    local: str

    model_config = ConfigDict(from_attributes=True)


class IngressoResponse(BaseModel):
    id: int
    status: StatusIngresso | str
    criado_em: datetime
    pronto_em: Optional[datetime] = None
    evento: EventoResumo

    model_config = ConfigDict(from_attributes=True)


class IngressoPagina(BaseModel):
    items: list[IngressoResponse]
    total: int
    limit: int
    offset: int


class IngressoDownloadResponse(BaseModel):
    url: str
    expira_em: int = 300
