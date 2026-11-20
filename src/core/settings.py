from typing import Optional
from urllib.parse import urlsplit

from pydantic_settings import BaseSettings, SettingsConfigDict


def parse_cors_allowed_origins(value: str) -> list[str]:
    origins: list[str] = []

    for raw_origin in value.split(","):
        origin = raw_origin.strip().rstrip("/")
        if not origin:
            continue
        if origin == "*":
            raise ValueError("CORS_ALLOWED_ORIGINS não aceita origem curinga.")

        parsed = urlsplit(origin)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.netloc
            or parsed.path
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError(
                "CORS_ALLOWED_ORIGINS deve conter somente origens HTTP(S), "
                "separadas por vírgula e sem caminhos."
            )

        normalized_origin = f"{parsed.scheme}://{parsed.netloc}"
        if normalized_origin not in origins:
            origins.append(normalized_origin)

    if not origins:
        raise ValueError("CORS_ALLOWED_ORIGINS deve informar ao menos uma origem.")

    return origins


class Settings(BaseSettings):
    # Conexão Banco Relacional (PostgreSQL)
    DB_USER: str = "appuser"
    DB_PASSWORD: str = "app_password_local"
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "appdb"

    # Conexão Cache (Valkey)
    CACHE_HOST: str = "localhost"
    CACHE_PORT: int = 6379

    # Mensageria Assíncrona (RabbitMQ)
    RABBITMQ_URL: str = "amqp://guest:guest@localhost:5672/"
    RABBITMQ_EXCHANGE: str = "ticketz.tickets"
    RABBITMQ_QUEUE: str = "ticketz.ticket.processing"
    RABBITMQ_DLQ: str = "ticketz.ticket.processing.dlq"
    RABBITMQ_MAX_RETRIES: int = 3
    WORKER_DELAY_SECONDS: float = 0.0

    # Object Storage (Garage / S3-Compatible)
    S3_ENDPOINT_URL: Optional[str] = "http://localhost:3900"
    S3_PUBLIC_ENDPOINT_URL: Optional[str] = "http://localhost:3900"
    S3_REGION: str = "us-east-1"
    S3_ACCESS_KEY_ID: Optional[str] = "GK0102030405060708090a0b0c"
    S3_SECRET_ACCESS_KEY: Optional[str] = (
        "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20"
    )
    S3_BUCKET: str = "ticketz-files-local"
    S3_BUCKET_BANNERS: Optional[str] = None
    S3_BUCKET_TICKETS: Optional[str] = None

    # Banco de Documentos / Auditoria (DynamoDB Local)
    DYNAMODB_ENDPOINT_URL: Optional[str] = "http://localhost:8001"
    DYNAMODB_TABLE: str = "ticketz-action-logs"
    AWS_REGION: str = "us-east-1"
    AWS_DEFAULT_REGION: str = "us-east-1"
    AWS_ACCESS_KEY_ID: Optional[str] = "local"
    AWS_SECRET_ACCESS_KEY: Optional[str] = "local"
    AWS_SESSION_TOKEN: Optional[str] = None
    AWS_ENDPOINT_URL: Optional[str] = None

    # Auth & JWT
    SECRET_KEY: str = "ticketz-super-secret-key-change-in-production-min-32-chars"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 horas (480 minutos)
    ALLOW_ORGANIZER_SIGNUP: bool = True
    CORS_ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:8000"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def database_url(self) -> str:
        return f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    @property
    def redis_url(self) -> str:
        return f"redis://{self.CACHE_HOST}:{self.CACHE_PORT}/0"

    @property
    def cors_allowed_origins(self) -> list[str]:
        return parse_cors_allowed_origins(self.CORS_ALLOWED_ORIGINS)

    @property
    def s3_bucket_banners(self) -> str:
        return self.S3_BUCKET_BANNERS or self.S3_BUCKET

    @property
    def s3_bucket_tickets(self) -> str:
        return self.S3_BUCKET_TICKETS or self.S3_BUCKET


settings = Settings()
