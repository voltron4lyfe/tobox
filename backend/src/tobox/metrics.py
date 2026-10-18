"""Pure metric computations over a day's planned items and log entries.

Kept free of DB/HTTP concerns so they are trivially unit-testable.
"""

from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date

from tobox.schemas import DaySummary, HighlightStatus, MetricsSummary, QuadrantMinutes, Verdict

HIT_VERDICTS: frozenset[Verdict] = frozenset({"done", "worked"})
NEUTRAL_VERDICTS: frozenset[Verdict] = frozenset({"idle"})


@dataclass(frozen=True)
class ItemFacts:
    id: int
    initiative_id: int
    title: str
    quadrant: int
    estimate_minutes: int
    is_highlight: bool
    done: bool


@dataclass(frozen=True)
class LogFacts:
    initiative_id: int
    planned_item_id: int | None
    quadrant: int
    minutes: int


def empty_quadrants() -> QuadrantMinutes:
    return {str(q): 0 for q in range(1, 5)}


def ratio(num: float, den: float) -> float:
    return round(num / den, 4) if den else 0.0


def logged_minutes_by_item(logs: Iterable[LogFacts]) -> dict[int, int]:
    out: dict[int, int] = defaultdict(int)
    for log in logs:
        if log.planned_item_id is not None:
            out[log.planned_item_id] += log.minutes
    return dict(out)


def summarize_day(items: Sequence[ItemFacts], logs: Sequence[LogFacts]) -> DaySummary:
    planned_by_q = empty_quadrants()
    for item in items:
        planned_by_q[str(item.quadrant)] += item.estimate_minutes

    actual_by_q = empty_quadrants()
    for log in logs:
        actual_by_q[str(log.quadrant)] += log.minutes
    actual = sum(actual_by_q.values())

    planned_item_ids = {i.id for i in items}
    planned_initiatives = {i.initiative_id for i in items}
    on_plan = sum(
        log.minutes
        for log in logs
        if log.planned_item_id in planned_item_ids or log.initiative_id in planned_initiatives
    )

    by_item = logged_minutes_by_item(logs)
    hl_item = next((i for i in items if i.is_highlight), None)
    highlight = (
        HighlightStatus(
            item_id=hl_item.id,
            title=hl_item.title,
            initiative_id=hl_item.initiative_id,
            quadrant=hl_item.quadrant,
            logged_minutes=by_item.get(hl_item.id, 0),
            done=hl_item.done,
        )
        if hl_item
        else None
    )

    return DaySummary(
        planned_minutes=sum(planned_by_q.values()),
        actual_minutes=actual,
        planned_by_quadrant=planned_by_q,
        actual_by_quadrant=actual_by_q,
        important_share=ratio(actual_by_q["1"] + actual_by_q["2"], actual),
        q2_share=ratio(actual_by_q["2"], actual),
        plan_adherence=ratio(on_plan, actual),
        unplanned_minutes=actual - on_plan,
        items_planned=len(items),
        items_done=sum(1 for i in items if i.done),
        highlight=highlight,
        verdict=verdict_for(highlight, has_activity=bool(items or logs)),
    )


def verdict_for(highlight: HighlightStatus | None, *, has_activity: bool) -> Verdict:
    if highlight is None:
        return "unplanned" if has_activity else "idle"
    if highlight.done:
        return "done"
    if highlight.logged_minutes > 0:
        return "worked"
    return "missed"


def streaks(verdicts: Sequence[Verdict]) -> tuple[int, int]:
    """(current, longest) runs of highlight hits over chronologically ordered verdicts.

    Idle days (nothing planned or logged, e.g. weekends) neither extend nor break a
    streak. The final day gets grace: if it isn't a hit yet it is treated as in
    progress rather than breaking the current streak.
    """
    longest = run = 0
    for v in verdicts:
        if v in NEUTRAL_VERDICTS:
            continue
        run = run + 1 if v in HIT_VERDICTS else 0
        longest = max(longest, run)

    current = 0
    relevant = list(verdicts)
    # Grace applies to the final day only (today, still in progress), not to an earlier miss.
    if relevant and relevant[-1] not in HIT_VERDICTS:
        relevant = relevant[:-1]
    relevant = [v for v in relevant if v not in NEUTRAL_VERDICTS]
    for v in reversed(relevant):
        if v not in HIT_VERDICTS:
            break
        current += 1
    return current, longest


def summarize_range(days: Sequence[tuple[date, DaySummary, int | None]]) -> MetricsSummary:
    actual_by_q = empty_quadrants()
    planned_by_q = empty_quadrants()
    tracked = [(d, s, r) for d, s, r in days if s.verdict not in NEUTRAL_VERDICTS]
    for _, s, _ in tracked:
        for q in actual_by_q:
            actual_by_q[q] += s.actual_by_quadrant[q]
            planned_by_q[q] += s.planned_by_quadrant[q]
    total = sum(actual_by_q.values())

    with_highlight = [s for _, s, _ in tracked if s.highlight is not None]
    hits = [s for s in with_highlight if s.verdict in HIT_VERDICTS]
    with_logs = [s for _, s, _ in tracked if s.actual_minutes > 0]
    planned_days = [s for _, s, _ in tracked if s.planned_minutes > 0]
    ratings = [r for _, _, r in tracked if r is not None]
    current, longest = streaks([s.verdict for _, s, _ in days])

    return MetricsSummary(
        days_tracked=len(tracked),
        total_minutes=total,
        actual_by_quadrant=actual_by_q,
        planned_by_quadrant=planned_by_q,
        important_share=ratio(actual_by_q["1"] + actual_by_q["2"], total),
        q2_share=ratio(actual_by_q["2"], total),
        avg_plan_adherence=ratio(sum(s.plan_adherence for s in with_logs), len(with_logs)),
        highlight_days=len(hits),
        highlight_hit_rate=ratio(len(hits), len(with_highlight)),
        plan_accuracy=ratio(
            sum(s.actual_minutes for s in planned_days),
            sum(s.planned_minutes for s in planned_days),
        ),
        current_streak=current,
        longest_streak=longest,
        avg_rating=round(sum(ratings) / len(ratings), 2) if ratings else None,
    )
