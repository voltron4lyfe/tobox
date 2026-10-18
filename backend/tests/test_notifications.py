import base64
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, ClassVar
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from tests.conftest import DAY
from tobox import prefs as prefs_store
from tobox.models import NotificationLog
from tobox.notify import channels, dispatch
from tobox.notify.events import Notification, highlight_nudge, plan_reminder, review_reminder
from tobox.notify.scheduler import due_kinds, tick
from tobox.schemas import DayOut, Preferences

Monday = datetime(2026, 3, 2, tzinfo=ZoneInfo("Europe/London"))  # == DAY


def at(hh: int, mm: int = 0, base: datetime = Monday) -> datetime:
    return base.replace(hour=hh, minute=mm)


class FakeChannel:
    name: ClassVar[str] = "fake"
    label: ClassVar[str] = "Fake"

    def __init__(self) -> None:
        self.sent: list[Notification] = []

    def enabled(self, prefs: Preferences) -> bool:
        return True

    def ready(self, session: Session, prefs: Preferences) -> tuple[bool, str]:
        return True, "always"

    def send(self, session: Session, prefs: Preferences, note: Notification) -> str:
        self.sent.append(note)
        return "ok"


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> FakeChannel:
    channel = FakeChannel()
    monkeypatch.setattr(dispatch, "CHANNELS", {"fake": channel})
    return channel


def put_prefs(client: TestClient, **changes: Any) -> dict[str, Any]:
    current = client.get("/api/preferences").json()
    for path, value in changes.items():
        target = current
        *parents, leaf = path.split("__")
        for key in parents:
            target = target[key]
        target[leaf] = value
    res = client.put("/api/preferences", json=current)
    assert res.status_code == 200, res.text
    return dict(res.json())


# --- Events (pure) ---------------------------------------------------------------------------


def day(client: TestClient) -> DayOut:
    return DayOut.model_validate(client.get(f"/api/days/{DAY}").json())


def test_plan_reminder_only_when_nothing_planned(client: TestClient, make_initiative: Any) -> None:
    assert plan_reminder(day(client)) is not None
    init = make_initiative()
    client.post(f"/api/days/{DAY}/items", json={"initiative_id": init["id"]})
    assert plan_reminder(day(client)) is None


def test_highlight_nudge_until_time_is_logged(client: TestClient, make_initiative: Any) -> None:
    assert highlight_nudge(day(client)) is None  # no highlight
    init = make_initiative()
    item = client.post(
        f"/api/days/{DAY}/items", json={"initiative_id": init["id"], "title": "Chapter 3"}
    ).json()["items"][0]
    note = highlight_nudge(day(client))
    assert note is not None
    assert "Chapter 3" in note.body
    client.post(f"/api/days/{DAY}/logs", json={"planned_item_id": item["id"], "minutes": 15})
    assert highlight_nudge(day(client)) is None


def test_review_reminder_until_reviewed(client: TestClient, make_initiative: Any) -> None:
    assert review_reminder(day(client)) is None  # an empty day needs no review
    init = make_initiative()
    client.post(f"/api/days/{DAY}/logs", json={"initiative_id": init["id"], "minutes": 30})
    assert review_reminder(day(client)) is not None
    client.put(f"/api/days/{DAY}", json={"reviewed": True})
    assert review_reminder(day(client)) is None


# --- Scheduling ------------------------------------------------------------------------------


def test_due_inside_window_only() -> None:
    p = Preferences()  # plan 08:30, nudge 14:00, review 17:30, Mon-Fri
    assert due_kinds(p, at(8, 29), set()) == []
    assert due_kinds(p, at(8, 30), set()) == ["plan_reminder"]
    assert due_kinds(p, at(10, 29), set()) == ["plan_reminder"]
    assert due_kinds(p, at(10, 30), set()) == []  # too late: never send a stale reminder
    assert due_kinds(p, at(17, 45), set()) == ["review_reminder"]


def test_due_respects_handled_disabled_and_weekdays() -> None:
    p = Preferences()
    assert due_kinds(p, at(8, 45), {"plan_reminder"}) == []
    p.notifications.plan_reminder.enabled = False
    assert due_kinds(p, at(8, 45), set()) == []
    saturday = at(17, 45, Monday.replace(day=7))
    assert due_kinds(Preferences(), saturday, set()) == []


def test_tick_sends_once_and_settles_skips(
    client: TestClient, session_factory: sessionmaker[Session], fake: FakeChannel
) -> None:
    put_prefs(client, timezone="Europe/London")
    with session_factory() as s:
        assert tick(s, at(8, 40)) == ["plan_reminder"]
        assert tick(s, at(8, 50)) == []  # already handled today
        # Nothing logged, so the 17:30 review has nothing to review: settled as skipped.
        assert tick(s, at(17, 40)) == []
        assert tick(s, at(17, 50)) == []
    assert [n.kind for n in fake.sent] == ["plan_reminder"]
    log = client.get("/api/notifications/log").json()
    assert [(e["kind"], e["channel"]) for e in log] == [
        ("review_reminder", "-"),
        ("plan_reminder", "fake"),
    ]


# --- Preferences -----------------------------------------------------------------------------


def test_preferences_defaults_and_round_trip(client: TestClient) -> None:
    prefs = client.get("/api/preferences").json()
    assert prefs["theme"] == "system"
    assert prefs["timezone"] is None
    assert prefs["notifications"]["plan_reminder"] == {"enabled": True, "time": "08:30"}
    saved = put_prefs(
        client,
        theme="dark",
        timezone="America/New_York",
        notifications__review_reminder__time="18:15",
    )
    assert client.get("/api/preferences").json() == saved


@pytest.mark.parametrize(
    ("path", "value"),
    [
        ("timezone", "Mars/Olympus"),
        ("theme", "neon"),
        ("notifications__plan_reminder__time", "25:00"),
        ("notifications__channels__discord__webhook_url", "https://evil.example/hook"),
    ],
)
def test_invalid_preferences_rejected(client: TestClient, path: str, value: str) -> None:
    current = client.get("/api/preferences").json()
    target = current
    *parents, leaf = path.split("__")
    for key in parents:
        target = target[key]
    target[leaf] = value
    assert client.put("/api/preferences", json=current).status_code == 422


def test_local_today_follows_timezone(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as s:
        prefs_store.save(s, Preferences(timezone="Pacific/Kiritimati"))  # UTC+14
        assert prefs_store.local_today(s) == datetime.now(ZoneInfo("Pacific/Kiritimati")).date()
        assert prefs_store.local_today(s) >= datetime.now(UTC).date()


# --- Channels ----------------------------------------------------------------------------------

SUB = {"endpoint": "https://push.example/sub/1", "keys": {"p256dh": "BPk", "auth": "a1"}}


def test_vapid_key_is_stable_and_well_formed(client: TestClient) -> None:
    first = client.get("/api/notifications/webpush").json()
    raw = base64.urlsafe_b64decode(first["public_key"] + "=")
    assert len(raw) == 65
    assert raw[0] == 4
    assert client.get("/api/notifications/webpush").json()["public_key"] == first["public_key"]


def test_subscribe_is_idempotent_and_unsubscribe(client: TestClient) -> None:
    assert client.post("/api/notifications/webpush/subscriptions", json=SUB).status_code == 204
    assert client.post("/api/notifications/webpush/subscriptions", json=SUB).status_code == 204
    assert client.get("/api/notifications/webpush").json()["subscriptions"] == 1
    client.post("/api/notifications/webpush/unsubscribe", json={"endpoint": SUB["endpoint"]})
    assert client.get("/api/notifications/webpush").json()["subscriptions"] == 0


def test_channels_report_readiness(client: TestClient) -> None:
    put_prefs(client, notifications__channels__webpush__enabled=True)
    info = {c["name"]: c for c in client.get("/api/notifications/channels").json()}
    assert info["webpush"]["enabled"] is True
    assert info["webpush"]["ready"] is False
    assert info["discord"]["enabled"] is False
    client.post("/api/notifications/webpush/subscriptions", json=SUB)
    info = {c["name"]: c for c in client.get("/api/notifications/channels").json()}
    assert info["webpush"]["ready"] is True


def test_test_notification_through_channels(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    posted: list[dict[str, Any]] = []
    pushed: list[str] = []

    class Res:
        status_code = 204

    def fake_post(url: str, json: dict[str, Any], timeout: float) -> Res:
        posted.append({"url": url, **json})
        return Res()

    def fake_webpush(subscription_info: dict[str, Any], data: str, **_: Any) -> None:
        pushed.append(data)

    monkeypatch.setattr(channels.httpx, "post", fake_post)
    monkeypatch.setattr(channels, "webpush", fake_webpush)
    hook = "https://discord.com/api/webhooks/1/abc"
    put_prefs(
        client,
        notifications__channels__discord__enabled=True,
        notifications__channels__discord__webhook_url=hook,
        notifications__channels__webpush__enabled=True,
    )
    client.post("/api/notifications/webpush/subscriptions", json=SUB)

    res = client.post("/api/notifications/test").json()
    assert {(d["channel"], d["ok"]) for d in res["deliveries"]} == {
        ("webpush", True),
        ("discord", True),
    }
    assert posted[0]["url"] == hook
    assert posted[0]["embeds"][0]["url"] == "http://localhost:8000/settings"
    assert '"url": "/settings"' in pushed[0]
    assert client.get("/api/notifications/log").json() == []  # tests aren't recorded


def test_expired_push_subscription_is_removed(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    class Gone:
        status_code = 410

    def gone(**_: Any) -> None:
        raise channels.WebPushException("gone", response=Gone())

    monkeypatch.setattr(channels, "webpush", gone)
    put_prefs(client, notifications__channels__webpush__enabled=True)
    client.post("/api/notifications/webpush/subscriptions", json=SUB)
    res = client.post("/api/notifications/test").json()
    assert res["deliveries"] == [
        {"channel": "webpush", "ok": False, "detail": "removed an expired subscription"}
    ]
    assert client.get("/api/notifications/webpush").json()["subscriptions"] == 0


def test_one_failing_channel_does_not_block_others(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, fake: FakeChannel
) -> None:
    class Broken(FakeChannel):
        name: ClassVar[str] = "broken"

        def send(self, session: Session, prefs: Preferences, note: Notification) -> str:
            raise RuntimeError("boom")

    monkeypatch.setattr(dispatch, "CHANNELS", {"broken": Broken(), "fake": fake})
    res = client.post("/api/notifications/test").json()
    assert res["deliveries"] == [
        {"channel": "broken", "ok": False, "detail": "internal error"},
        {"channel": "fake", "ok": True, "detail": "ok"},
    ]


def test_dispatch_with_no_channels_is_logged(
    session_factory: sessionmaker[Session], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(dispatch, "CHANNELS", {})
    note = Notification(kind="plan_reminder", title="t", body="b")
    record: Callable[..., Any] = dispatch.dispatch
    with session_factory() as s:
        assert record(s, Preferences(), note, Monday.date()) == []
        assert s.query(NotificationLog).one().detail == "no channels enabled"
