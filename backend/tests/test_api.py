from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import DAY, NEXT_DAY

MakeInit = Callable[..., dict[str, Any]]


def add_item(client: TestClient, initiative_id: int, **kw: Any) -> dict[str, Any]:
    res = client.post(f"/api/days/{DAY}/items", json={"initiative_id": initiative_id, **kw})
    assert res.status_code == 201, res.text
    return dict(res.json())


def test_health(client: TestClient) -> None:
    assert client.get("/api/health").json() == {"status": "ok"}


def test_initiative_crud(client: TestClient, make_initiative: MakeInit) -> None:
    a = make_initiative("Fitness", 2)
    make_initiative("Taxes", 1)
    listed = client.get("/api/initiatives").json()
    assert [i["title"] for i in listed] == ["Taxes", "Fitness"]  # ordered by quadrant

    res = client.patch(f"/api/initiatives/{a['id']}", json={"status": "archived"})
    assert res.json()["status"] == "archived"
    assert len(client.get("/api/initiatives").json()) == 1
    assert len(client.get("/api/initiatives?include_archived=true").json()) == 2

    assert client.delete(f"/api/initiatives/{a['id']}").status_code == 204
    assert client.patch(f"/api/initiatives/{a['id']}", json={"title": "x"}).status_code == 404


def test_initiative_validation(client: TestClient) -> None:
    assert client.post("/api/initiatives", json={"title": "x", "quadrant": 5}).status_code == 422
    assert client.post("/api/initiatives", json={"title": "", "quadrant": 1}).status_code == 422


def test_empty_day(client: TestClient) -> None:
    day = client.get(f"/api/days/{DAY}").json()
    assert day["items"] == []
    assert day["logs"] == []
    assert day["summary"]["verdict"] == "idle"


def test_first_item_becomes_highlight(client: TestClient, make_initiative: MakeInit) -> None:
    init = make_initiative()
    day = add_item(client, init["id"])
    assert day["items"][0]["is_highlight"] is True
    assert day["items"][0]["title"] == init["title"]  # defaults to initiative title
    day = add_item(client, init["id"], title="Second")
    assert [i["is_highlight"] for i in day["items"]] == [True, False]

    day = add_item(client, init["id"], title="New top", is_highlight=True)
    assert day["items"][0]["title"] == "New top"
    assert sum(i["is_highlight"] for i in day["items"]) == 1
    assert [i["rank"] for i in day["items"]] == [0, 1, 2]


def test_plan_capacity_limit(client: TestClient, make_initiative: MakeInit) -> None:
    init = make_initiative()
    for n in range(6):
        add_item(client, init["id"], title=f"t{n}")
    res = client.post(f"/api/days/{DAY}/items", json={"initiative_id": init["id"]})
    assert res.status_code == 409


def test_reorder_sets_highlight(client: TestClient, make_initiative: MakeInit) -> None:
    init = make_initiative()
    add_item(client, init["id"], title="a")
    day = add_item(client, init["id"], title="b")
    a, b = (i["id"] for i in day["items"])
    day = client.post(f"/api/days/{DAY}/items/reorder", json={"ids": [b, a]}).json()
    assert [i["title"] for i in day["items"]] == ["b", "a"]
    assert day["items"][0]["is_highlight"] is True
    bad = client.post(f"/api/days/{DAY}/items/reorder", json={"ids": [a]})
    assert bad.status_code == 422


def test_deleting_highlight_promotes_next(client: TestClient, make_initiative: MakeInit) -> None:
    init = make_initiative()
    add_item(client, init["id"], title="a")
    day = add_item(client, init["id"], title="b")
    day = client.delete(f"/api/items/{day['items'][0]['id']}").json()
    assert [(i["title"], i["is_highlight"]) for i in day["items"]] == [("b", True)]


def test_logging_and_verdict(client: TestClient, make_initiative: MakeInit) -> None:
    q2 = make_initiative("Deep work", 2)
    q3 = make_initiative("Email", 3)
    day = add_item(client, q2["id"], estimate_minutes=120)
    item_id = day["items"][0]["id"]
    assert day["summary"]["verdict"] == "missed"

    day = client.post(
        f"/api/days/{DAY}/logs", json={"initiative_id": q3["id"], "minutes": 60}
    ).json()
    assert day["summary"]["verdict"] == "missed"
    assert day["summary"]["plan_adherence"] == 0

    day = client.post(
        f"/api/days/{DAY}/logs",
        json={"planned_item_id": item_id, "minutes": 60, "title": "Drafted"},
    ).json()
    assert day["summary"]["verdict"] == "worked"
    assert day["items"][0]["logged_minutes"] == 60
    assert day["logs"][-1]["initiative_id"] == q2["id"]
    assert day["logs"][-1]["quadrant"] == 2

    day = client.post(
        f"/api/days/{DAY}/logs", json={"planned_item_id": item_id, "minutes": 30, "mark_done": True}
    ).json()
    assert day["summary"]["verdict"] == "done"
    assert day["summary"]["q2_share"] == 0.6


def test_log_requires_link(client: TestClient) -> None:
    assert client.post(f"/api/days/{DAY}/logs", json={"minutes": 5}).status_code == 422


def test_update_and_delete_log(client: TestClient, make_initiative: MakeInit) -> None:
    a = make_initiative("A", 2)
    b = make_initiative("B", 4)
    day = client.post(f"/api/days/{DAY}/logs", json={"initiative_id": a["id"]}).json()
    log_id = day["logs"][0]["id"]
    day = client.patch(f"/api/logs/{log_id}", json={"initiative_id": b["id"], "minutes": 15}).json()
    assert day["logs"][0]["quadrant"] == 4
    assert day["logs"][0]["minutes"] == 15
    day = client.patch(f"/api/logs/{log_id}", json={"title": "renamed"}).json()
    assert day["logs"][0]["title"] == "renamed"
    day = client.delete(f"/api/logs/{log_id}").json()
    assert day["logs"] == []


def test_quadrant_snapshot_survives_reclassification(
    client: TestClient, make_initiative: MakeInit
) -> None:
    init = make_initiative("Side project", 2)
    client.post(f"/api/days/{DAY}/logs", json={"initiative_id": init["id"], "minutes": 30})
    client.patch(f"/api/initiatives/{init['id']}", json={"quadrant": 4})
    day = client.get(f"/api/days/{DAY}").json()
    assert day["logs"][0]["quadrant"] == 2


def test_day_plan_and_review(client: TestClient) -> None:
    day = client.put(f"/api/days/{DAY}", json={"intention": "Ship v1", "planned": True}).json()
    assert day["intention"] == "Ship v1"
    assert day["planned_at"] is not None
    day = client.put(
        f"/api/days/{DAY}", json={"reflection": "Good", "rating": 4, "reviewed": True}
    ).json()
    assert day["rating"] == 4
    assert day["reviewed_at"] is not None
    assert day["intention"] == "Ship v1"
    assert client.put(f"/api/days/{DAY}", json={"rating": 9}).status_code == 422


def test_carry_forward(client: TestClient, make_initiative: MakeInit) -> None:
    init = make_initiative()
    add_item(client, init["id"], title="done one")
    day = add_item(client, init["id"], title="unfinished")
    client.patch(f"/api/items/{day['items'][0]['id']}", json={"done": True})

    target = client.post(f"/api/days/{DAY}/carry-forward", json={"to_date": NEXT_DAY}).json()
    assert [i["title"] for i in target["items"]] == ["unfinished"]
    assert target["items"][0]["is_highlight"] is True
    assert target["items"][0]["carried_from_id"] == day["items"][1]["id"]
    again = client.post(f"/api/days/{DAY}/carry-forward", json={"to_date": NEXT_DAY}).json()
    assert len(again["items"]) == 1  # idempotent


def test_metrics_range(client: TestClient, make_initiative: MakeInit) -> None:
    init = make_initiative("Deep work", 2)
    day = add_item(client, init["id"], estimate_minutes=60)
    client.post(
        f"/api/days/{DAY}/logs",
        json={"planned_item_id": day["items"][0]["id"], "minutes": 90, "mark_done": True},
    )
    client.put(f"/api/days/{DAY}", json={"rating": 5})

    m = client.get("/api/metrics", params={"start": "2026-03-01", "end": NEXT_DAY}).json()
    assert len(m["days"]) == 3
    assert m["summary"]["days_tracked"] == 1
    assert m["summary"]["highlight_hit_rate"] == 1.0
    assert m["summary"]["current_streak"] == 1
    assert m["summary"]["avg_rating"] == 5
    assert m["initiatives"][0]["actual_minutes"] == 90
    assert m["initiatives"][0]["highlight_days"] == 1

    bad = client.get("/api/metrics", params={"start": NEXT_DAY, "end": DAY})
    assert bad.status_code == 422
