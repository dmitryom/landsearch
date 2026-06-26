import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "LandSearch"
    debug: bool = False

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/landsearch"
    redis_url: str = "redis://localhost:6379/0"

    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 60 * 24

    cors_origins: str = "http://195.2.74.197,https://195.2.74.197"

    nspd_proxy: str | None = None
    nspd_timeout: int = 30

    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "landsearch"

    yandex_oauth_token: str | None = None
    google_credentials_file: str | None = None

    model_config = {"env_file": ".env", "env_prefix": "LANDSEARCH_"}

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def sql_echo(self) -> bool:
        return self.debug


settings = Settings()
