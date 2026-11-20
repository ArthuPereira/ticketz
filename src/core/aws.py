from functools import lru_cache
from typing import Any
import boto3
from botocore.client import Config
from src.core.settings import settings


def _get_s3_kwargs(endpoint_url: str | None) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "region_name": settings.S3_REGION or settings.AWS_REGION,
        "config": Config(
            s3={"addressing_style": "path"},
            signature_version="s3v4",
        ),
    }
    if endpoint_url:
        kwargs["endpoint_url"] = endpoint_url
    access_key = settings.S3_ACCESS_KEY_ID or settings.AWS_ACCESS_KEY_ID
    secret_key = settings.S3_SECRET_ACCESS_KEY or settings.AWS_SECRET_ACCESS_KEY
    if access_key:
        kwargs["aws_access_key_id"] = access_key
    if secret_key:
        kwargs["aws_secret_access_key"] = secret_key
    return kwargs


def _get_dynamodb_kwargs() -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "region_name": settings.AWS_REGION,
        "aws_access_key_id": settings.AWS_ACCESS_KEY_ID or "local",
        "aws_secret_access_key": settings.AWS_SECRET_ACCESS_KEY or "local",
    }
    endpoint = settings.DYNAMODB_ENDPOINT_URL or settings.AWS_ENDPOINT_URL
    if endpoint:
        kwargs["endpoint_url"] = endpoint
    if settings.AWS_SESSION_TOKEN:
        kwargs["aws_session_token"] = settings.AWS_SESSION_TOKEN
    return kwargs


@lru_cache
def get_s3_client():
    """Retorna cliente S3 para operações internas (upload, delete, head) no Garage."""
    endpoint = settings.S3_ENDPOINT_URL or settings.AWS_ENDPOINT_URL
    return boto3.client("s3", **_get_s3_kwargs(endpoint))


@lru_cache
def get_s3_public_client():
    """Retorna cliente S3 configurado com o endpoint público para assinar presigned URLs."""
    endpoint = (
        settings.S3_PUBLIC_ENDPOINT_URL
        or settings.S3_ENDPOINT_URL
        or settings.AWS_ENDPOINT_URL
    )
    return boto3.client("s3", **_get_s3_kwargs(endpoint))


@lru_cache
def get_dynamodb_client():
    """Retorna cliente baixo nível do DynamoDB Local."""
    return boto3.client("dynamodb", **_get_dynamodb_kwargs())


@lru_cache
def get_dynamodb_resource():
    """Retorna resource de alto nível do DynamoDB Local."""
    return boto3.resource("dynamodb", **_get_dynamodb_kwargs())
