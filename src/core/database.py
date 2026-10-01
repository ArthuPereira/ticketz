from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from src.core.settings import settings

# motor de conexão assíncrona que consome a property gerada pelo config.py
engine = create_async_engine(
    settings.database_url, 
    echo=True,  # imprime as queries SQL no terminal, tirar depois
)

# fábrica de sessões assíncronas para manipulação de dados
AsyncSessionLocal = async_sessionmaker(
    bind=engine, 
    class_=AsyncSession, 
    expire_on_commit=False
)

# Classe base do SQLAlchemy
class Base(DeclarativeBase):
    pass

# Dependência do FastAPI para injetar a sessão do banco de dados nas rotas
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
