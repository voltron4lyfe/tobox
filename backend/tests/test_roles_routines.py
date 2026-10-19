"""Roles group initiatives; routines recur and are offered on the days they're due."""

from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import DAY, NEXT_DAY

# DAY is a Monday, NEXT_DAY a Tuesday.
MakeInit = Any


def role(client: TestClient, name: str) -> dict[str, Any]:
    res = client.post("/api/roles", json={"name": name})
    assert res.status_code == 201, res.text
    return dict(res.json())


def routine(client: TestClient, initiative_id: int, **kw: Any) -> dict[str, Any]:
    body = {"initiative_id": initiative_id, "weekdays": [0], "start_date": DAY, **kw}
    res = client.post("/api/routines", json=body)
    assert res.status_code == 201, res.text
    return dict(res.json())


# --- Roles ---------------------------------------------------------------------------------


def test_roles_crud_and_initiative_assignment(
    client: TestClient, make_initiative: MakeInit
) -> None:
    parent = role(client, "  Parent ")
    work = role(client, "Professional")
    assert parent["name"] == "Parent"
    assert [r["name"] for r in client.get("/api/roles").json()] == ["Parent", "Professional"]

    soccer = make_initiative("Kids' soccer", 1, role_id=parent["id"])
    assert soccer["role_id"] == parent["id"]
    moved = client.patch(f"/api/initiatives/{soccer['id']}", json={"role_id": work["id"]})
    assert moved.json()["role_id"] == work["id"]
    cleared = client.patch(f"/api/initiatives/{soccer['id']}", json={"role_id": None})
    assert cleared.json()["role_id"] is None

    renamed = client.patch(f"/api/roles/{parent['id']}", json={"name": "Father"})
    assert renamed.json()["name"] == "Father"


def test_unknown_role_is_rejected(client: TestClient, make_initiative: MakeInit) -> None:
    res = client.post("/api/initiatives", json={"title": "X", "quadrant": 2, "role_id": 99})
    assert res.status_code == 404
    init = make_initiative()
    assert client.patch(f"/api/initiatives/{init['id']}", json={"role_id": 99}).status_code == 404


def test_deleting_a_role_keeps_its_initiatives(
    client: TestClient, make_initiative: MakeInit
) -> None:
    parent = role(client, "Parent")
    init = make_initiative("Bedtime stories", 2, role_id=parent["id"])
    assert client.delete(f"/api/roles/{parent['id']}").status_code == 204
    [kept] = client.get("/api/initiatives").json()
    assert kept["id"] == init["id"]
    assert kept["role_id"] is None


def test_metrics_show_time_per_role_including_neglected_ones(
    client: TestClient, make_initiative: MakeInit
) -> None:
    parent = role(client, "Parent")
    health = role(client, "Health")
    work = role(client, "Professional")
    soccer = make_initiative("Soccer", 1, role_id=parent["id"])
    report = make_initiative("Report", 1, role_id=work["id"])
    loose = make_initiative("Errands", 3)
    client.post(
        f"/api/days/{DAY}/items", json={"initiative_id": soccer["id"], "estimate_minutes": 90}
    )
    for init, mins in ((soccer, 60), (report, 240), (loose, 30)):
        client.post(f"/api/days/{DAY}/logs", json={"initiative_id": init["id"], "minutes": mins})

    m = client.get("/api/metrics", params={"start": DAY, "end": NEXT_DAY}).json()
    by_name = {r["name"]: r for r in m["roles"]}
    assert list(by_name) == ["Parent", "Health", "Professional", "No role"]
    assert by_name["Parent"]["actual_minutes"] == 60
    assert by_name["Parent"]["planned_minutes"] == 90
    assert by_name["Health"] == {
        "role_id": health["id"],
        "name": "Health",
        "actual_minutes": 0,
        "planned_minutes": 0,
        "days_worked": 0,
    }
    assert by_name["Professional"]["actual_minutes"] == 240
    assert by_name["No role"]["role_id"] is None
    assert by_name["No role"]["actual_minutes"] == 30


# --- Routines --------------------------------------------------------------------------------


def test_due_routines_are_offered_not_planned(
    client: TestClient, make_initiative: MakeInit
) -> None:
    gym = make_initiative("Fitness", 2)
    spin = routine(client, gym["id"], title="Spin class", weekdays=[0, 2], estimate_minutes=60)
    assert spin["title"] == "Spin class"
    assert spin["weekdays"] == [0, 2]

    monday = client.get(f"/api/days/{DAY}").json()
    assert monday["items"] == []
    assert [r["id"] for r in monday["routines_due"]] == [spin["id"]]
    assert client.get(f"/api/days/{NEXT_DAY}").json()["routines_due"] == []


def test_plan_routines_adds_due_ones_once(client: TestClient, make_initiative: MakeInit) -> None:
    gym = make_initiative("Fitness", 2)
    kids = make_initiative("Kids' soccer", 1)
    routine(client, gym["id"], title="Spin class", estimate_minutes=60)
    routine(client, kids["id"])  # title defaults to the initiative's

    day = client.post(f"/api/days/{DAY}/routines", json={}).json()
    assert [(i["title"], i["estimate_minutes"]) for i in day["items"]] == [
        ("Spin class", 60),
        ("Kids' soccer", 30),
    ]
    assert day["items"][0]["is_highlight"] is True
    assert day["items"][1]["quadrant"] == 1
    assert day["routines_due"] == []
    again = client.post(f"/api/days/{DAY}/routines", json={}).json()
    assert len(again["items"]) == 2


def test_plan_a_routine_on_a_day_it_isnt_due(client: TestClient, make_initiative: MakeInit) -> None:
    spin = routine(client, make_initiative("Fitness", 2)["id"], title="Spin")
    day = client.post(f"/api/days/{NEXT_DAY}/routines", json={"routine_ids": [spin["id"]]}).json()
    assert [i["routine_id"] for i in day["items"]] == [spin["id"]]


def test_plan_routines_respects_the_six_item_limit(
    client: TestClient, make_initiative: MakeInit
) -> None:
    init = make_initiative()
    for n in range(5):
        client.post(f"/api/days/{DAY}/items", json={"initiative_id": init["id"], "title": f"#{n}"})
    routine(client, init["id"], title="a")
    routine(client, init["id"], title="b")
    res = client.post(f"/api/days/{DAY}/routines", json={})
    assert res.status_code == 409
    assert len(client.get(f"/api/days/{DAY}").json()["items"]) == 5


def test_paused_routines_and_initiatives_are_not_offered(
    client: TestClient, make_initiative: MakeInit
) -> None:
    gym = make_initiative("Fitness", 2)
    spin = routine(client, gym["id"])
    client.patch(f"/api/routines/{spin['id']}", json={"active": False})
    assert client.get(f"/api/days/{DAY}").json()["routines_due"] == []
    client.patch(f"/api/routines/{spin['id']}", json={"active": True})
    client.patch(f"/api/initiatives/{gym['id']}", json={"status": "paused"})
    assert client.get(f"/api/days/{DAY}").json()["routines_due"] == []


def test_routine_validation(client: TestClient, make_initiative: MakeInit) -> None:
    init = make_initiative()
    bad = [
        {"initiative_id": init["id"], "weekdays": []},
        {"initiative_id": init["id"], "weekdays": [7]},
        {"initiative_id": init["id"], "weekdays": [0], "every_weeks": 0},
        {"initiative_id": 999, "weekdays": [0]},
    ]
    for body in bad:
        assert client.post("/api/routines", json=body).status_code in (404, 422), body


def test_deleting_a_routine_keeps_planned_items(
    client: TestClient, make_initiative: MakeInit
) -> None:
    spin = routine(client, make_initiative()["id"], title="Spin")
    client.post(f"/api/days/{DAY}/routines", json={})
    assert client.delete(f"/api/routines/{spin['id']}").status_code == 204
    [item] = client.get(f"/api/days/{DAY}").json()["items"]
    assert item["title"] == "Spin"
    assert item["routine_id"] is None


def test_carried_routine_items_keep_their_routine(
    client: TestClient, make_initiative: MakeInit
) -> None:
    spin = routine(client, make_initiative()["id"], weekdays=[0, 1])
    client.post(f"/api/days/{DAY}/routines", json={})
    tuesday = client.post(f"/api/days/{DAY}/carry-forward", json={"to_date": NEXT_DAY}).json()
    assert tuesday["items"][0]["routine_id"] == spin["id"]
    assert tuesday["routines_due"] == []  # already there, so not offered twice


def test_routine_adherence_in_metrics(client: TestClient, make_initiative: MakeInit) -> None:
    spin = routine(client, make_initiative()["id"], title="Spin", weekdays=[0, 2, 4])
    # Week of DAY: due Mon, Wed, Fri. Mon planned and done; Wed planned, with 0 minutes logged
    # and not done (not kept); Fri never planned.
    for day in ("2026-03-02", "2026-03-04"):
        client.post(f"/api/days/{day}/routines", json={})
    mon = client.get("/api/days/2026-03-02").json()["items"][0]
    client.patch(f"/api/items/{mon['id']}", json={"done": True})
    wed = client.get("/api/days/2026-03-04").json()["items"][0]
    client.post("/api/days/2026-03-04/logs", json={"planned_item_id": wed["id"], "minutes": 0})

    m = client.get("/api/metrics", params={"start": DAY, "end": "2026-03-08"}).json()
    [r] = m["routines"]
    assert (r["routine_id"], r["due_days"], r["planned_days"], r["kept_days"]) == (
        spin["id"],
        3,
        2,
        1,
    )
