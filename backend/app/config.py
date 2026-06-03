from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Database
    database_url: str

    # Scrapfly
    scrapfly_api_key: str

    # Anthropic
    anthropic_api_key: str

    # Google OAuth
    google_client_id: str
    google_client_secret: str

    # App
    app_secret_key: str
    app_base_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:3000"

    # Email
    mail_username: str = ""
    mail_password: str = ""
    mail_from: str = ""
    mail_server: str = "smtp.gmail.com"
    mail_port: int = 587

    # Scraping
    scrape_interval_hours: int = 6

    # Environment
    environment: str = "development"
    debug: bool = True

    @property
    def async_database_url(self) -> str:
        """asyncpg driver URL for SQLAlchemy async engine."""
        url = self.database_url
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        return url

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
