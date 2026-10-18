from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TOBOX_", env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./data/tobox.db"
    cors_origins: list[str] = ["http://localhost:5173"]
    # Max ranked items in a day's plan (Ivy Lee: six).
    max_plan_items: int = 6


@lru_cache
def get_settings() -> Settings:
    return Settings()
