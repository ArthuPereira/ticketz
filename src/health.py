import asyncio
from typing import Annotated
from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.action_log import check_dynamodb_ready
from src.core.cache import check_redis_ready, get_cache_stats
from src.core.database import get_db

router = APIRouter(tags=["Health"])


@router.get("/health", summary="Health check para o ALB")
def health_check():
    """Endpoint de verificação de integridade do processo sem dependências externas."""
    return {"status": "ok"}


@router.get("/health/ready", summary="Readiness check com RDS, Redis e DynamoDB")
async def readiness_check(
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Verifica se os componentes externos essenciais estão prontos para receber tráfego.
    Retorna 200 se todos estiverem OK, ou 503 se algum estiver indisponível."""
    async def _check_rds() -> bool:
        try:
            res = await asyncio.wait_for(db.execute(text("SELECT 1")), timeout=2.0)
            return res.scalar() == 1
        except Exception:
            return False

    rds_ok, redis_ok, dynamodb_ok = await asyncio.gather(
        _check_rds(),
        check_redis_ready(),
        check_dynamodb_ready(),
    )

    all_ready = rds_ok and redis_ok and dynamodb_ok
    if not all_ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ready" if all_ready else "unhealthy",
        "rds": "ok" if rds_ok else "error",
        "redis": "ok" if redis_ok else "error",
        "dynamodb": "ok" if dynamodb_ok else "error",
    }


@router.get("/cache/stats", summary="Métricas de acertos e falhas do Redis")
async def cache_stats():
    """Retorna contadores de hits e misses do cache Redis."""
    stats = await get_cache_stats()
    total = stats["hits"] + stats["misses"]
    hit_rate = (stats["hits"] / total * 100) if total > 0 else 0.0
    return {
        "hits": stats["hits"],
        "misses": stats["misses"],
        "total": total,
        "hit_rate_percent": round(hit_rate, 2),
    }
