from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    # Conexão Banco Relacional
    DB_USER: str
    DB_PASSWORD: str
    DB_HOST: str
    DB_PORT: int
    DB_NAME: str

    # Conexão Cache
    CACHE_HOST: str
    CACHE_PORT: int

    # Serviços AWS
    SNS_TOPIC_ARN: str
    SQS_QUEUE_URL: str
    S3_BUCKET: str
    DYNAMODB_TABLE: str

    # Configurações AWS 
    AWS_REGION: str = "us-east-1"
    AWS_DEFAULT_REGION: str = "us-east-1"
    AWS_ACCESS_KEY_ID: str = "test"
    AWS_SECRET_ACCESS_KEY: str = "test"
    AWS_ENDPOINT_URL: Optional[str] = None 

    # Auth & JWT
    SECRET_KEY: str = "ticketz-super-secret-key-change-in-production-min-32-chars"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 horas (480 minutos)
    ALLOW_ORGANIZER_SIGNUP: bool = True 

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )

    @property
    def database_url(self) -> str:
        return f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    @property
    def redis_url(self) -> str:
        return f"redis://{self.CACHE_HOST}:{self.CACHE_PORT}/0"
    
settings = Settings()