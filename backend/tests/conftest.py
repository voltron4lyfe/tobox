from collections.abc import Callable, Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from tobox.config import Settings
from tobox.db import Base, get_session, make_engine
from tobox.main import create_app

DAY = "2026-03-02"
NEXT_DAY = "2026-03-03"


@pytest.fixture
def engine() -> Iterator[Engine]:
    # One shared in-memory connection, created through make_engine so the same pragmas
    # (foreign keys, WAL) apply as in production.
    eng = make_engine("sqlite://", poolclass=StaticPool)
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture
def settings() -> Settings:
    return Settings(scheduler_enabled=False, owner_password="hunter2")


@pytest.fixture
def client(session_factory: sessionmaker[Session], settings: Settings) -> Iterator[TestClient]:
    def _session() -> Iterator[Session]:
        with session_factory() as s:
            yield s

    app = create_app(settings, session_factory=session_factory)
    app.dependency_overrides[get_session] = _session
    with TestClient(app) as c:
        yield c


@pytest.fixture
def make_initiative(client: TestClient) -> Callable[..., dict[str, Any]]:
    def _make(title: str = "Write book", quadrant: int = 2, **kw: Any) -> dict[str, Any]:
        res = client.post("/api/initiatives", json={"title": title, "quadrant": quadrant, **kw})
        assert res.status_code == 201, res.text
        return dict(res.json())

    return _make
