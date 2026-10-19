"""Who may use Tobox: owner sign-in for the REST API, and the Host / CSRF request guard."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from tobox.auth import COOKIE
from tobox.config import Settings
from tobox.db import get_session
from tobox.main import create_app

CSRF = {"X-Requested-With": "tobox"}


def make_client(
    session_factory: sessionmaker[Session], base_url: str = "http://testserver", **settings: object
) -> TestClient:
    config = Settings(scheduler_enabled=False, allowed_hosts=["testserver"], **settings)  # type: ignore[arg-type]
    app = create_app(config, session_factory=session_factory)

    def _session() -> Iterator[Session]:
        with session_factory() as s:
            yield s

    app.dependency_overrides[get_session] = _session
    return TestClient(app, base_url=base_url, headers=CSRF)


@pytest.fixture
def locked(session_factory: sessionmaker[Session]) -> TestClient:
    return make_client(session_factory, owner_password="hunter2")


def test_api_needs_sign_in_when_a_password_is_set(locked: TestClient) -> None:
    assert locked.get("/api/session").json() == {"password_required": True, "signed_in": False}
    for method, path in [
        ("GET", "/api/initiatives"),
        ("GET", "/api/preferences"),  # holds the Discord webhook URL
        ("DELETE", "/api/initiatives/1"),
        ("GET", "/api/agents"),
        ("POST", "/api/notifications/test"),
    ]:
        assert locked.request(method, path).status_code == 401, path
    assert locked.get("/api/health").status_code == 200


def test_sign_in_and_out(locked: TestClient) -> None:
    wrong = locked.post("/api/session", json={"password": "nope"})
    assert wrong.status_code == 401
    assert wrong.json()["detail"] == "Wrong password."
    res = locked.post("/api/session", json={"password": "hunter2"})
    assert res.json() == {"password_required": True, "signed_in": True}
    cookie = res.headers["set-cookie"]
    assert "HttpOnly" in cookie
    assert "samesite=lax" in cookie.lower()
    assert locked.get("/api/initiatives").status_code == 200
    assert locked.delete("/api/session").status_code == 204
    assert locked.get("/api/initiatives").status_code == 401


def test_forged_or_expired_cookies_are_refused(locked: TestClient) -> None:
    locked.cookies.set(COOKIE, "9999999999.deadbeef")
    assert locked.get("/api/initiatives").status_code == 401
    locked.cookies.clear()
    locked.post("/api/session", json={"password": "hunter2"})
    _, _, signature = locked.cookies[COOKIE].partition(".")
    locked.cookies.clear()
    locked.cookies.set(COOKIE, f"1.{signature}")
    assert locked.get("/api/initiatives").status_code == 401


def test_changing_the_password_signs_everyone_out(
    session_factory: sessionmaker[Session],
) -> None:
    old = make_client(session_factory, owner_password="hunter2")
    old.post("/api/session", json={"password": "hunter2"})
    new = make_client(session_factory, owner_password="correct horse")
    new.cookies = old.cookies
    assert new.get("/api/initiatives").status_code == 401


def test_secure_cookie_over_https(session_factory: sessionmaker[Session]) -> None:
    c = make_client(
        session_factory,
        base_url="https://tobox.example",
        owner_password="hunter2",
        public_url="https://tobox.example",
    )
    res = c.post("/api/session", json={"password": "hunter2"})
    assert "Secure" in res.headers["set-cookie"]


def test_no_password_means_open_access(session_factory: sessionmaker[Session]) -> None:
    c = make_client(session_factory)
    assert c.get("/api/session").json() == {"password_required": False, "signed_in": True}
    assert c.get("/api/initiatives").status_code == 200


def test_unknown_hosts_are_refused(session_factory: sessionmaker[Session]) -> None:
    """DNS rebinding: an attacker's domain pointed at Tobox arrives with its own Host."""
    c = make_client(session_factory, public_url="https://tobox.example")
    assert c.get("/api/health", headers={"Host": "evil.example"}).status_code == 400
    assert c.get("/mcp", headers={"Host": "evil.example"}).status_code == 400
    for host in ("tobox.example", "localhost:8080", "127.0.0.1:8000", "[::1]:8000"):
        assert c.get("/api/health", headers={"Host": host}).status_code == 200, host


def test_api_writes_need_the_csrf_header(session_factory: sessionmaker[Session]) -> None:
    c = make_client(session_factory)
    body = {"title": "X", "quadrant": 2}
    plain = TestClient(c.app)
    res = plain.post("/api/initiatives", json=body)
    assert res.status_code == 403
    assert plain.get("/api/initiatives").status_code == 200  # reads are fine
    assert c.post("/api/initiatives", json=body).status_code == 201
