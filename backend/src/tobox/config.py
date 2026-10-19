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
    # Externally reachable base URL (no trailing slash). OAuth issuer + MCP resource identifier,
    # and absolute links in notifications. Must be https unless it is localhost.
    public_url: str = "http://localhost:8000"
    # When set, the web UI and REST API require signing in with it, and approving an AI agent
    # needs it (or a signed-in browser). Unset: anyone who can reach Tobox is the owner, so only
    # leave it unset on localhost or behind an authenticating reverse proxy.
    owner_password: str | None = None
    # Host headers accepted besides public_url's host and localhost (DNS-rebinding defence).
    allowed_hosts: list[str] = []
    # Background loop that sends scheduled reminders. Disabled in tests.
    scheduler_enabled: bool = True
    # VAPID "sub" claim: how push services can contact the operator.
    vapid_subject: str = "mailto:tobox@example.com"


@lru_cache
def get_settings() -> Settings:
    return Settings()
