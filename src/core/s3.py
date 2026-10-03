import asyncio
from io import BytesIO
import logging
from typing import Optional
import uuid
from fastapi import HTTPException, UploadFile, status
from PIL import Image

from src.core.aws import get_s3_client
from src.core.settings import settings

logger = logging.getLogger("ticketz.s3")

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB
MAX_DIMENSION = 8000
MAX_PIXELS = 40_000_000

FORMAT_EXT_MAP = {
    "JPEG": "jpg",
    "PNG": "png",
    "WEBP": "webp",
}

CONTENT_TYPE_MAP = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}


def gerar_presigned_url(key: Optional[str], expires_in: int = 3600) -> Optional[str]:
    """Gera uma presigned URL temporária para leitura do objeto no S3."""
    if not key:
        return None
    try:
        s3 = get_s3_client()
        return s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.s3_bucket_banners, "Key": key},
            ExpiresIn=expires_in,
        )
    except Exception as e:
        logger.error("Erro ao gerar presigned URL para chave %s: %s", key, e)
        return None


async def upload_banner(evento_id: int, arquivo: UploadFile) -> str:
    """Valida o arquivo de banner (tamanho, formato real, dimensões) e realiza o upload para o S3."""
    # 1. Ler até MAX+1 bytes para conferir tamanho
    conteudo = await arquivo.read(MAX_FILE_SIZE + 1)
    if len(conteudo) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Arquivo muito grande. O limite máximo permitido é de 5MB.",
        )

    # 2. Validar integridade e formato com Pillow
    try:
        img = Image.open(BytesIO(conteudo))
        formato = (img.format or "").upper()
        if formato not in FORMAT_EXT_MAP:
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail=f"Formato de imagem não suportado: {formato}. Formatos aceitos: JPEG, PNG e WebP.",
            )
        img.verify()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Arquivo inválido ou não é uma imagem reconhecida.",
        )

    # 3. Reabrir para checar dimensões (img.verify() invalida o objeto)
    try:
        img_check = Image.open(BytesIO(conteudo))
        largura, altura = img_check.size
        if largura > MAX_DIMENSION or altura > MAX_DIMENSION or (largura * altura > MAX_PIXELS):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Dimensões da imagem excedem os limites suportados.",
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("Falha na validação de dimensões da imagem: %s", e)

    # 4. Gerar chave única no S3
    extensao = FORMAT_EXT_MAP[formato]
    chave = f"eventos/{evento_id}/banner-{uuid.uuid4().hex[:8]}.{extensao}"
    content_type = CONTENT_TYPE_MAP[formato]

    # 5. Upload via threadpool
    def _upload():
        s3 = get_s3_client()
        s3.put_object(
            Bucket=settings.s3_bucket_banners,
            Key=chave,
            Body=conteudo,
            ContentType=content_type,
        )

    await asyncio.to_thread(_upload)
    return chave


async def delete_object(key: Optional[str]) -> None:
    """Remove um objeto do bucket de banners no S3 sem interromper a requisição em caso de falha."""
    if not key:
        return

    def _delete():
        s3 = get_s3_client()
        s3.delete_object(Bucket=settings.s3_bucket_banners, Key=key)

    try:
        await asyncio.to_thread(_delete)
    except Exception as e:
        logger.warning("Falha ao remover objeto %s do S3: %s", key, e)
