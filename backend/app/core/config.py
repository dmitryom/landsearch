from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "LandSearch"
    debug: bool = False

    database_url: str = ""
    redis_url: str = "redis://localhost:6379/0"

    secret_key: str = ""
    access_token_expire_minutes: int = 60 * 24
    public_tenant_slug: str | None = "demo-tenant"

    cors_origins: str = "http://195.2.74.197,https://195.2.74.197,http://localhost:3000,http://127.0.0.1,http://127.0.0.1:3000"

    nspd_proxy: str | None = None
    nspd_timeout: int = 30

    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket: str = "landsearch"

    yandex_oauth_token: str | None = None
    google_credentials_file: str | None = None

    model_config = {"env_file": ".env", "env_prefix": "LANDSEARCH_"}

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if not self.database_url:
            raise ValueError("LANDSEARCH_DATABASE_URL must be set")
        if not self.secret_key:
            raise ValueError("LANDSEARCH_SECRET_KEY must be set")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def sql_echo(self) -> bool:
        return self.debug


settings = Settings()
