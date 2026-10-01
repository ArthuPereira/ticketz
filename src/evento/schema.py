from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator


class EventoBase(BaseModel):
    nome: str = Field(..., max_length=150, description="Nome do evento")
    descricao: Optional[str] = Field(None, description="Descrição detalhada do evento")
    local: str = Field(..., max_length=150, description="Local onde ocorrerá o evento")
    data: datetime = Field(..., description="Data e hora da realização (ISO 8601)")
    total_ingressos: int = Field(..., gt=0, description="Quantidade total de ingressos à venda")


# schema para validar o payload recebido no POST
class EventoCreate(EventoBase):
    organizador_id: int = Field(..., description="ID do organizador do evento")
    ingressos_disponiveis: Optional[int] = Field(
        None,
        ge=0,
        description="Quantidade de ingressos disponíveis inicialmente (padrão: total_ingressos)",
    )
    banner_key: Optional[str] = Field(None, max_length=255, description="Chave do banner no S3")
    ativo: bool = Field(True, description="Indica se o evento está ativo")

    @model_validator(mode="after")
    def validar_estoque(self) -> "EventoCreate":
        if self.ingressos_disponiveis is None:
            self.ingressos_disponiveis = self.total_ingressos
        elif self.ingressos_disponiveis > self.total_ingressos:
            raise ValueError("ingressos_disponiveis não pode ser maior que total_ingressos")
        return self


# schema para atualização do evento
class EventoUpdate(BaseModel):
    nome: Optional[str] = Field(None, max_length=150)
    descricao: Optional[str] = None
    local: Optional[str] = Field(None, max_length=150)
    data: Optional[datetime] = None
    total_ingressos: Optional[int] = Field(None, gt=0)
    ingressos_disponiveis: Optional[int] = Field(None, ge=0)
    banner_key: Optional[str] = Field(None, max_length=255)
    ativo: Optional[bool] = None


# schema para serializar a resposta
class EventoResponse(EventoBase):
    id: int
    organizador_id: int
    ingressos_disponiveis: int
    banner_key: Optional[str] = None
    ativo: bool
    criado_em: datetime
    atualizado_em: datetime

    # converter a classe do banco (ORM) em JSON
    model_config = ConfigDict(from_attributes=True)
