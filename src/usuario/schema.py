from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from src.core.models import PapelUsuario


class UsuarioBase(BaseModel):
    email: EmailStr = Field(..., max_length=255, description="E-mail do usuário")
    nome: str = Field(..., max_length=150, description="Nome do usuário")
    papel: PapelUsuario = Field(
        default=PapelUsuario.USER,
        description="Papel do usuário no sistema ('user' ou 'organizer')",
    )


class UsuarioCreate(UsuarioBase):
    senha: str = Field(..., min_length=6, max_length=255, description="Senha do usuário")


class UsuarioUpdate(BaseModel):
    email: Optional[EmailStr] = Field(None, max_length=255)
    nome: Optional[str] = Field(None, max_length=150)
    senha: Optional[str] = Field(None, min_length=6, max_length=255)
    papel: Optional[PapelUsuario] = None


class UsuarioResponse(UsuarioBase):
    id: int
    criado_em: datetime

    model_config = ConfigDict(from_attributes=True)
