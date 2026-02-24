from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False)

    app_name: str = "eupaygrid-backend"
    environment: str = "dev"
    log_level: str = "INFO"

    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:3000"

    postgres_dsn: str = "postgresql://eupaygrid:eupaygrid@postgres:5432/eupaygrid"
    postgres_min_pool: int = 1
    postgres_max_pool: int = 10

    allowed_currencies: str = Field(default="EUR")
    settlement_layer: str = "simulated-solana"

    otel_enabled: bool = False
    otel_exporter_endpoint: str = "http://otel-collector:4317"

    @property
    def allowed_currencies_set(self) -> set[str]:
        return {item.strip().upper() for item in self.allowed_currencies.split(",") if item.strip()}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
