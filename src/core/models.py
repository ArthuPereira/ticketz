import enum
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from src.core.database import Base


class Evento(Base):
    __tablename__ = "eventos"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    nome: Mapped[str] = mapped_column(String(150), index=True)
    data: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    local: Mapped[str] = mapped_column(String(150))
    lote_ingressos_disponiveis: Mapped[int] = mapped_column(Integer)
    banner_url: Mapped[str | None] = mapped_column(String(255), nullable=True)

    ingressos: Mapped[list["Ingresso"]] = relationship(back_populates="evento", cascade="all, delete-orphan")


class StatusIngresso(str, enum.Enum):
    DISPONIVEL = "disponivel"
    RESERVADO = "reservado"
    VENDIDO = "vendido"


class Ingresso(Base):
    __tablename__ = "ingressos"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    evento_id: Mapped[int] = mapped_column(ForeignKey("eventos.id"))
    assento: Mapped[str] = mapped_column(String(20))
    status: Mapped[StatusIngresso] = mapped_column(SQLEnum(StatusIngresso), default=StatusIngresso.DISPONIVEL)
    
    # E-mail do comprador
    dono_email: Mapped[str | None] = mapped_column(String(150), nullable=True)
    
    # Ficheiro binário obrigatório armazenado no S3
    pdf_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    
    # Controlo de concorrência
    versao: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    evento: Mapped["Evento"] = relationship(back_populates="ingressos")

    __mapper_args__ = {
        "version_id_col": versao  # Ativa o Bloqueio Otimista nativo do SQLAlchemy
    }