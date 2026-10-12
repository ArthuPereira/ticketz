import pytest
from fastapi.middleware.cors import CORSMiddleware

from src.core.settings import parse_cors_allowed_origins, settings
from src.main import app


def test_cors_expoe_cabecalho_de_cache_ao_frontend():
    cors_middleware = next(
        middleware
        for middleware in app.user_middleware
        if middleware.cls is CORSMiddleware
    )

    assert cors_middleware.kwargs["expose_headers"] == ["X-Cache"]
    assert cors_middleware.kwargs["allow_origins"] == settings.cors_allowed_origins
    assert cors_middleware.kwargs["allow_credentials"] is True
    assert cors_middleware.kwargs["allow_headers"] == ["*"]
    assert cors_middleware.kwargs["allow_methods"] == ["*"]


def test_cors_normaliza_origens_configuradas_sem_duplicar():
    assert parse_cors_allowed_origins(
        "http://localhost:5173/, https://frontend.example.com, "
        "https://frontend.example.com/"
    ) == ["http://localhost:5173", "https://frontend.example.com"]


@pytest.mark.parametrize(
    "value",
    ["", "*", "frontend.example.com", "https://frontend.example.com/app"],
)
def test_cors_rejeita_configuracao_insegura_ou_invalida(value):
    with pytest.raises(ValueError):
        parse_cors_allowed_origins(value)
