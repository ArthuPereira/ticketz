from datetime import datetime, timezone
from typing import Optional
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator


class EventoBase(BaseModel):
    nome: str = Field(..., min_length=1, max_length=150, description="Nome do evento")
    descricao: Optional[str] = Field(None, description="Descrição detalhada do evento")
    local: str = Field(..., min_length=1, max_length=150, description="Local onde ocorrerá o evento")
    data: AwareDatetime = Field(
        ...,
        description="Data e hora da realização com fuso horário obrigatório (ISO 8601)",
    )
    total_ingressos: int = Field(..., gt=0, description="Quantidade total de ingressos à venda")
    banner_key: Optional[str] = Field(None, max_length=255, description="Chave do banner no S3")


# schema para criar evento (POST /eventos)
class EventoCreate(EventoBase):
    @field_validator("data")
    @classmethod
    def validar_data_futura(cls, v: datetime) -> datetime:
        if v <= datetime.now(timezone.utc):
            raise ValueError("A data do evento deve ser futura")
        return v


# schema para atualizar evento (PUT /eventos/{id})
class EventoUpdate(BaseModel):
    nome: Optional[str] = Field(None, min_length=1, max_length=150)
    descricao: Optional[str] = None
    local: Optional[str] = Field(None, min_length=1, max_length=150)
    data: Optional[AwareDatetime] = None
    banner_key: Optional[str] = Field(None, max_length=255)

    # Rejeita campos extras, como a tentativa de alterar total_ingressos na v1
    model_config = ConfigDict(extra="forbid")

    @field_validator("data")
    @classmethod
    def validar_data_futura(cls, v: Optional[datetime]) -> Optional[datetime]:
        if v is not None and v <= datetime.now(timezone.utc):
            raise ValueError("A data do evento deve ser futura")
        return v


# schema para serializar a resposta (GET, POST, PUT)
class EventoResponse(EventoBase):
    id: int
    organizador_id: int
    ingressos_disponiveis: int
    banner_url: Optional[str] = None  # Retorna null até a Etapa 5
    ativo: bool
    criado_em: datetime
    atualizado_em: datetime

    model_config = ConfigDict(from_attributes=True)


# envelope para listagem paginada (GET /eventos e GET /eventos/meus)
class EventoPagina(BaseModel):
    items: list[EventoResponse]
    total: int
    limit: int
    offset: int
