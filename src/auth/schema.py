from pydantic import BaseModel, ConfigDict, EmailStr, Field
from src.core.models import PapelUsuario


class RegisterIn(BaseModel):
    nome: str = Field(..., min_length=1, max_length=150, description="Nome do usuário")
    email: EmailStr = Field(..., max_length=255, description="E-mail válido do usuário")
    senha: str = Field(..., min_length=8, max_length=255, description="Senha de acesso (mínimo de 8 caracteres)")
    papel: PapelUsuario = Field(
        default=PapelUsuario.USER,
        description="Papel do usuário ('user' ou 'organizer')",
    )


class LoginIn(BaseModel):
    email: EmailStr = Field(..., description="E-mail do usuário")
    senha: str = Field(..., min_length=1, description="Senha do usuário")


class UsuarioOut(BaseModel):
    id: int
    nome: str
    email: EmailStr
    papel: PapelUsuario

    model_config = ConfigDict(from_attributes=True)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
