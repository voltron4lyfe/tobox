from collections.abc import Iterator
from pathlib import Path
from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from tobox.config import get_settings


class Base(DeclarativeBase):
    pass


def make_engine(url: str, **kwargs: Any) -> Engine:
    connect_args: dict[str, object] = {}
    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
        db_path = url.removeprefix("sqlite:///")
        if db_path and db_path != ":memory:":
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(url, connect_args=connect_args, **kwargs)

    if url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_conn, _record):  # type: ignore[no-untyped-def]
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA journal_mode=WAL")
            cur.close()

    return engine


engine = make_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def insert_if_missing(session: Session, model: type[Base], **values: Any) -> None:
    """INSERT … ON CONFLICT DO NOTHING: create a row unless a concurrent writer already has."""
    dialect = postgresql if session.get_bind().dialect.name == "postgresql" else sqlite
    session.execute(dialect.insert(model).values(**values).on_conflict_do_nothing())


def get_session() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session
