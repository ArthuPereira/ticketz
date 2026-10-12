from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.auth.router import router as auth_router
from src.core.cache import close_redis_client
from src.core.settings import settings
from src.evento.router import router as evento_router
from src.health import router as health_router
from src.ingresso.router import router as ingresso_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await close_redis_client()


app = FastAPI(
    title="Ticketz API",
    description="Backend para plataforma de reserva e emissão de ingressos",
    version="1.0.0",
    lifespan=lifespan,
)

# A origem de produção deve ser o domínio HTTPS publicado pelo CloudFront.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Cache"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(evento_router)
app.include_router(ingresso_router)


@app.get("/")
def health_check():
    return {"status": "ok", "message": "API do Ticketz operante"}
