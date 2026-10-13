from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src.auth.router import router as auth_router
from src.core.cache import close_redis_client
from src.core.settings import settings
from src.evento.router import router as evento_router
from src.health import router as health_router
from src.ingresso.router import router as ingresso_router

FRONTEND_DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"
INDEX_HTML = FRONTEND_DIST_DIR / "index.html"
ASSETS_DIR = FRONTEND_DIST_DIR / "assets"


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

# CORS mantido para compatibilidade de chamadas externas e testes locais
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Cache"],
)


@app.middleware("http")
async def spa_navigation_middleware(request: Request, call_next):
    """
    Se a requisição for GET e o cliente for navegador solicitando HTML,
    retorna o index.html da SPA, exceto para documentação Swagger e rotas reservadas.
    Requisições de API com Accept: application/json passam direto aos endpoints.
    """
    path = request.url.path
    if (
        request.method == "GET"
        and not path.startswith(("/docs", "/redoc", "/openapi.json", "/assets/", "/health"))
        and INDEX_HTML.is_file()
    ):
        accept = request.headers.get("accept", "")
        if "text/html" in accept:
            return FileResponse(INDEX_HTML)

    return await call_next(request)


app.include_router(health_router)
app.include_router(auth_router)
app.include_router(evento_router)
app.include_router(ingresso_router)

# Monta arquivos de assets (JS, CSS) gerados pelo build do Vite
if ASSETS_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="frontend-assets")


@app.get("/", include_in_schema=False)
async def serve_root(request: Request):
    """
    Endpoint raiz: serve o frontend se compilado, ou status JSON caso explicitamente solicitado.
    """
    accept = request.headers.get("accept", "")
    if INDEX_HTML.is_file() and ("text/html" in accept or "application/json" not in accept):
        return FileResponse(INDEX_HTML)
    return {"status": "ok", "message": "API do Ticketz operante"}


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_static_or_spa(request: Request, full_path: str):
    """
    Fallback para rotas da SPA (ex: /login, /meus-ingressos) ou arquivos da raiz do frontend.
    """
    candidate_file = FRONTEND_DIST_DIR / full_path
    if full_path and candidate_file.is_file():
        return FileResponse(candidate_file)

    if INDEX_HTML.is_file():
        accept = request.headers.get("accept", "")
        if "text/html" in accept or "*/*" in accept or not accept:
            return FileResponse(INDEX_HTML)

    return Response(content='{"detail":"Not Found"}', status_code=404, media_type="application/json")
