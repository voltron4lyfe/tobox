from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TOBOX_", env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./data/tobox.db"
    cors_origins: list[str] = ["http://localhost:5173"]
    # Max ranked items in a day's plan (Ivy Lee: six).
    max_plan_items: int = 6
    # Built frontend (vite build output). When set, the API also serves the SPA: the Docker
    # image sets it so a single container is the whole app. Unset in dev (Vite serves it).
    static_dir: Path | None = None
    # Build identifier reported by /api/health (the image sets it to the git tag or sha).
    version: str = "dev"


@lru_cache
def get_settings() -> Settings:
    return Settings()
