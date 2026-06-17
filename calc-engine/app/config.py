from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    scrapfly_api_key: str = ""
    webhook_url: str = ""
    db_path: str = "./data/rates.db"
    log_path: str = "./logs/audit.jsonl"
    rate_check_interval_weeks: int = 3
    environment: str = "development"


settings = Settings()
