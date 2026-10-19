from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tobox.config import Settings
from tobox.main import IMMUTABLE, create_app


@pytest.fixture
def dist(tmp_path: Path) -> Path:
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text('<div id="root"></div>')
    (tmp_path / "assets" / "app-1a2b.js").write_text("console.log(1)")
    (tmp_path / "favicon.svg").write_text("<svg/>")
    (tmp_path.parent / "secret.txt").write_text("nope")
    return tmp_path


@pytest.fixture
def spa(dist: Path) -> TestClient:
    return TestClient(
        create_app(
            Settings(
                static_dir=dist, version="v9.9.9", scheduler_enabled=False, allowed_hosts=["*"]
            )
        )
    )


def test_health_reports_version(spa: TestClient) -> None:
    assert spa.get("/api/health").json() == {"status": "ok", "version": "v9.9.9"}


def test_hashed_assets_are_cached_forever(spa: TestClient) -> None:
    res = spa.get("/assets/app-1a2b.js")
    assert res.status_code == 200
    assert res.text == "console.log(1)"
    assert res.headers["cache-control"] == IMMUTABLE


def test_other_files_and_client_routes_are_not_cached(spa: TestClient) -> None:
    assert spa.get("/favicon.svg").headers["cache-control"] == "no-cache"
    for path in ["/", "/plan", "/history?range=30"]:
        res = spa.get(path)
        assert res.status_code == 200
        assert res.text == '<div id="root"></div>'
        assert res.headers["cache-control"] == "no-cache"


def test_unknown_api_paths_stay_404(spa: TestClient) -> None:
    assert spa.get("/api/nope").status_code == 404
    assert spa.get("/api").status_code == 404


def test_cannot_escape_static_dir(spa: TestClient) -> None:
    res = spa.get("/%2E%2E/secret.txt")
    assert "nope" not in res.text


def test_no_spa_without_static_dir() -> None:
    assert (
        TestClient(create_app(Settings(scheduler_enabled=False, allowed_hosts=["*"])))
        .get("/plan")
        .status_code
        == 404
    )


def test_missing_index_fails_fast(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match=r"index\.html"):
        create_app(Settings(static_dir=tmp_path, scheduler_enabled=False, allowed_hosts=["*"]))


def test_head_requests_are_supported(spa: TestClient) -> None:
    res = spa.head("/assets/app-1a2b.js")
    assert res.status_code == 200
    assert res.headers["cache-control"] == IMMUTABLE
