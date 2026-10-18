from pathlib import Path

from alembic import command
from alembic.config import Config

BACKEND = Path(__file__).resolve().parents[1]


def test_migrations_match_models(tmp_path: Path) -> None:
    """Upgrading to head must yield exactly the ORM schema (no un-generated model changes)."""
    cfg = Config(BACKEND / "alembic.ini")
    cfg.set_main_option("script_location", str(BACKEND / "migrations"))
    cfg.set_main_option("sqlalchemy.url", f"sqlite:///{tmp_path / 'm.db'}")
    command.upgrade(cfg, "head")
    command.check(cfg)
    command.downgrade(cfg, "base")
