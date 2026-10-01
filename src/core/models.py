import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.core.database import Base


class PapelUsuario(str, enum.Enum):
    USER = "user"
    ORGANIZER = "organizer"


class StatusIngresso(str, enum.Enum):
    PENDING = "PENDING"
    READY = "READY"
    FAILED = "FAILED"


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    senha_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    papel: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=PapelUsuario.USER.value,
        server_default=text("'user'"),
    )
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now(),
        server_default=func.now(),
    )

    # Relacionamentos
    eventos: Mapped[list["Evento"]] = relationship(
        back_populates="organizador",
        cascade="all, delete-orphan",
    )
    ingressos: Mapped[list["Ingresso"]] = relationship(
        back_populates="usuario",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint("papel IN ('user', 'organizer')", name="ck_usuarios_papel"),
        Index("uq_usuarios_email", func.lower(email), unique=True),
    )


class Evento(Base):
    __tablename__ = "eventos"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    organizador_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("usuarios.id"),
        nullable=False,
    )
    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    local: Mapped[str] = mapped_column(String(150), nullable=False)
    data: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    total_ingressos: Mapped[int] = mapped_column(Integer, nullable=False)
    ingressos_disponiveis: Mapped[int] = mapped_column(Integer, nullable=False)
    banner_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ativo: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now(),
        server_default=func.now(),
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now(),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relacionamentos
    organizador: Mapped["Usuario"] = relationship(back_populates="eventos")
    ingressos: Mapped[list["Ingresso"]] = relationship(
        back_populates="evento",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint("total_ingressos > 0", name="ck_eventos_total"),
        CheckConstraint(
            "ingressos_disponiveis >= 0 AND ingressos_disponiveis <= total_ingressos",
            name="ck_eventos_estoque",
        ),
        Index("ix_eventos_data", "data", postgresql_where=text("ativo")),
        Index("ix_eventos_organizador", "organizador_id"),
    )


class Ingresso(Base):
    __tablename__ = "ingressos"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    evento_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("eventos.id"),
        nullable=False,
    )
    usuario_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("usuarios.id"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default=StatusIngresso.PENDING.value,
        server_default=text("'PENDING'"),
    )
    codigo: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    pdf_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now(),
        server_default=func.now(),
    )
    pronto_em: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Relacionamentos
    evento: Mapped["Evento"] = relationship(back_populates="ingressos")
    usuario: Mapped["Usuario"] = relationship(back_populates="ingressos")

    __table_args__ = (
        CheckConstraint(
            "status IN ('PENDING', 'READY', 'FAILED')",
            name="ck_ingressos_status",
        ),
        CheckConstraint(
            "status <> 'READY' OR pdf_key IS NOT NULL",
            name="ck_ingressos_pdf",
        ),
        UniqueConstraint("codigo", name="uq_ingressos_codigo"),
        UniqueConstraint("evento_id", "usuario_id", name="uq_ingressos_evento_usuario"),
        Index("ix_ingressos_usuario", "usuario_id", criado_em.desc()),
        Index("ix_ingressos_evento", "evento_id"),
    )