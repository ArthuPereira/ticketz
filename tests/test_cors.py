from fastapi.middleware.cors import CORSMiddleware

from src.main import app


def test_cors_expoe_cabecalho_de_cache_ao_frontend():
    cors_middleware = next(
        middleware
        for middleware in app.user_middleware
        if middleware.cls is CORSMiddleware
    )

    assert cors_middleware.kwargs["expose_headers"] == ["X-Cache"]
