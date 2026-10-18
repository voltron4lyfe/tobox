from datetime import date

import pytest

from tobox.metrics import ItemFacts, LogFacts, streaks, summarize_day, summarize_range
from tobox.schemas import Verdict


def item(id: int = 1, q: int = 2, est: int = 60, hl: bool = False, done: bool = False) -> ItemFacts:
    return ItemFacts(
        id,
        initiative_id=id * 10,
        title=f"i{id}",
        quadrant=q,
        estimate_minutes=est,
        is_highlight=hl,
        done=done,
    )


def log(init: int, mins: int, q: int = 2, item_id: int | None = None) -> LogFacts:
    return LogFacts(initiative_id=init, planned_item_id=item_id, quadrant=q, minutes=mins)


def test_empty_day_is_idle() -> None:
    s = summarize_day([], [])
    assert s.verdict == "idle"
    assert s.actual_minutes == 0
    assert s.q2_share == 0.0


def test_quadrant_shares_and_adherence() -> None:
    items = [item(1, q=2, est=90, hl=True), item(2, q=1, est=30)]
    logs = [log(10, 60, q=2, item_id=1), log(20, 30, q=1), log(99, 30, q=3)]
    s = summarize_day(items, logs)
    assert s.planned_minutes == 120
    assert s.actual_minutes == 120
    assert s.actual_by_quadrant == {"1": 30, "2": 60, "3": 30, "4": 0}
    assert s.q2_share == 0.5
    assert s.important_share == 0.75
    assert s.plan_adherence == 0.75
    assert s.unplanned_minutes == 30
    assert s.highlight is not None
    assert s.highlight.logged_minutes == 60
    assert s.verdict == "worked"


@pytest.mark.parametrize(
    ("items", "logs", "expected"),
    [
        ([item(hl=True, done=True)], [], "done"),
        ([item(hl=True)], [log(10, 5, item_id=1)], "worked"),
        ([item(hl=True)], [log(10, 5)], "missed"),  # same initiative, but not the item
        ([], [log(10, 5)], "unplanned"),
    ],
)
def test_verdicts(items: list[ItemFacts], logs: list[LogFacts], expected: Verdict) -> None:
    assert summarize_day(items, logs).verdict == expected


@pytest.mark.parametrize(
    ("verdicts", "expected"),
    [
        ([], (0, 0)),
        (["done", "worked", "done"], (3, 3)),
        (["done", "missed", "done"], (1, 1)),
        (["done", "idle", "done"], (2, 2)),  # idle days are neutral
        (["done", "done", "missed"], (2, 2)),  # last day in progress gets grace
        (["done", "missed", "missed"], (0, 1)),
        (["unplanned", "done"], (1, 1)),
    ],
)
def test_streaks(verdicts: list[Verdict], expected: tuple[int, int]) -> None:
    assert streaks(verdicts) == expected


def test_summarize_range_skips_idle_days() -> None:
    d1 = summarize_day([item(hl=True, done=True)], [log(10, 60, item_id=1)])
    d2 = summarize_day([], [])
    d3 = summarize_day([item(hl=True)], [log(99, 60, q=4)])
    s = summarize_range(
        [(date(2026, 1, 1), d1, 4), (date(2026, 1, 2), d2, None), (date(2026, 1, 3), d3, 2)]
    )
    assert s.days_tracked == 2
    assert s.total_minutes == 120
    assert s.q2_share == 0.5
    assert s.highlight_days == 1
    assert s.highlight_hit_rate == 0.5
    assert s.avg_rating == 3
    assert s.avg_plan_adherence == 0.5
