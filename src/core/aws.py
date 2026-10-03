from functools import lru_cache
from typing import Any
import boto3
from botocore.client import Config
from src.core.settings import settings


def _get_common_kwargs() -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "region_name": settings.AWS_REGION,
    }
    if settings.AWS_ENDPOINT_URL:
        kwargs["endpoint_url"] = settings.AWS_ENDPOINT_URL
    if settings.AWS_ACCESS_KEY_ID:
        kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
    if settings.AWS_SECRET_ACCESS_KEY:
        kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY
    return kwargs


@lru_cache
def get_s3_client():
    """Retorna cliente S3 configurado com addressing_style='path' para compatibilidade com MiniStack/LocalStack."""
    kwargs = _get_common_kwargs()
    kwargs["config"] = Config(
        s3={"addressing_style": "path"},
        signature_version="s3v4",
    )
    return boto3.client("s3", **kwargs)


@lru_cache
def get_dynamodb_client():
    """Retorna cliente baixo nível do DynamoDB."""
    kwargs = _get_common_kwargs()
    return boto3.client("dynamodb", **kwargs)


@lru_cache
def get_dynamodb_resource():
    """Retorna resource de alto nível do DynamoDB."""
    kwargs = _get_common_kwargs()
    return boto3.resource("dynamodb", **kwargs)


@lru_cache
def get_sns_client():
    """Retorna cliente SNS."""
    kwargs = _get_common_kwargs()
    return boto3.client("sns", **kwargs)


@lru_cache
def get_sqs_client():
    """Retorna cliente SQS."""
    kwargs = _get_common_kwargs()
    return boto3.client("sqs", **kwargs)
