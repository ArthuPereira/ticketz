from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.auth.router import router as auth_router
from src.core.cache import close_redis_client
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

# CORS habilitado para suportar requisições do frontend com Authorization header
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(evento_router)
app.include_router(ingresso_router)


@app.get("/")
def health_check():
    return {"status": "ok", "message": "API do Ticketz operante"}
