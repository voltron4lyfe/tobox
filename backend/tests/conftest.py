from collections.abc import Callable, Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from tobox.db import Base, get_session, make_engine
from tobox.main import create_app

DAY = "2026-03-02"
NEXT_DAY = "2026-03-03"


@pytest.fixture
def engine() -> Iterator[Engine]:
    eng = make_engine("sqlite://")
    eng.pool = StaticPool(eng.pool._creator)  # share one in-memory connection
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def client(engine: Engine) -> Iterator[TestClient]:
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def _session() -> Iterator[Session]:
        with factory() as s:
            yield s

    app = create_app()
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
