from fastapi import APIRouter

router = APIRouter(tags=["Health"])


@router.get("/health", summary="Health check para o ALB")
def health_check():
    """Endpoint de verificação de integridade do processo sem dependências externas."""
    return {"status": "ok"}
