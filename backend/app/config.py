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

    # Scrapfly — add SCRAPFLY_API_KEY_2, _3 etc. to .env for automatic fallback
    # Empty = scraping disabled (demo mode)
    scrapfly_api_key: str = ""
    scrapfly_api_key_2: str = ""
    scrapfly_api_key_3: str = ""
    scrapfly_api_key_4: str = ""

    # Anthropic (optional — only needed if using Claude for brief generation)
    anthropic_api_key: str = ""

    # Ollama (local LLM for brief generation)
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"

    # Google OAuth — empty = login disabled (demo mode)
    google_client_id: str = ""
    google_client_secret: str = ""

    # App
    app_secret_key: str = "demo-insecure-secret-change-in-production"
    app_base_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:3000"

    # Admin bootstrap — creates one admin account on startup if it doesn't
    # exist yet. Empty = skipped (no admin account is auto-created).
    admin_bootstrap_email: str = ""
    admin_bootstrap_password: str = ""

    # Registration gating — when True, creating an account (email/password OR
    # first-time Google sign-in) requires a valid, unused invite code. Existing
    # users' login is never gated. Set REQUIRE_INVITE_CODE=false to open signup.
    require_invite_code: bool = True

    # Email
    mail_username: str = ""
    mail_password: str = ""
    mail_from: str = ""
    mail_server: str = "smtp.gmail.com"
    mail_port: int = 587

    # Scraping
    scrape_interval_hours: int = 2
    # Only ingest listings in these cities (comma-separated, deaccented lowercase).
    # Keeps scraping aligned with our zoning coverage so every saved listing is
    # zonable. Empty string = no restriction (keep everything).
    target_cities: str = "montreal,laval"

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
