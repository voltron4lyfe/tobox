from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from tobox.api.deps import SessionDep
from tobox.metrics import summarize_range
from tobox.models import Day, Initiative, LogEntry, PlannedItem
from tobox.schemas import DayMetrics, InitiativeMetrics, MetricsOut
from tobox.services import summarize

router = APIRouter(prefix="/metrics", tags=["metrics"])

MAX_RANGE_DAYS = 3 * 366


@router.get("", response_model=MetricsOut)
def get_metrics(start: date, end: date, session: SessionDep) -> MetricsOut:
    if end < start:
        raise HTTPException(422, "end must be on or after start")
    if (end - start).days > MAX_RANGE_DAYS:
        raise HTTPException(422, f"range is limited to {MAX_RANGE_DAYS} days")

    items_by_day: dict[date, list[PlannedItem]] = defaultdict(list)
    for item in session.scalars(select(PlannedItem).where(PlannedItem.date.between(start, end))):
        items_by_day[item.date].append(item)
    logs_by_day: dict[date, list[LogEntry]] = defaultdict(list)
    for log in session.scalars(select(LogEntry).where(LogEntry.date.between(start, end))):
        logs_by_day[log.date].append(log)
    ratings = {
        d.date: d.rating for d in session.scalars(select(Day).where(Day.date.between(start, end)))
    }

    days: list[DayMetrics] = []
    cursor = start
    while cursor <= end:
        summary = summarize(items_by_day[cursor], logs_by_day[cursor])
        days.append(DayMetrics(**summary.model_dump(), date=cursor, rating=ratings.get(cursor)))
        cursor += timedelta(days=1)

    return MetricsOut(
        start=start,
        end=end,
        summary=summarize_range([(d.date, d, d.rating) for d in days]),
        days=days,
        initiatives=_initiative_metrics(session, items_by_day, logs_by_day),
    )


def _initiative_metrics(
    session: SessionDep,
    items_by_day: dict[date, list[PlannedItem]],
    logs_by_day: dict[date, list[LogEntry]],
) -> list[InitiativeMetrics]:
    actual: dict[int, int] = defaultdict(int)
    planned: dict[int, int] = defaultdict(int)
    worked_days: dict[int, set[date]] = defaultdict(set)
    highlight_days: dict[int, int] = defaultdict(int)
    for day, logs in logs_by_day.items():
        for log in logs:
            actual[log.initiative_id] += log.minutes
            worked_days[log.initiative_id].add(day)
    for items in items_by_day.values():
        for item in items:
            planned[item.initiative_id] += item.estimate_minutes
            if item.is_highlight:
                highlight_days[item.initiative_id] += 1

    ids = set(actual) | set(planned)
    if not ids:
        return []
    initiatives = session.scalars(select(Initiative).where(Initiative.id.in_(ids)))
    out = [
        InitiativeMetrics(
            initiative_id=i.id,
            title=i.title,
            quadrant=i.quadrant,
            status=i.status,
            actual_minutes=actual[i.id],
            planned_minutes=planned[i.id],
            days_worked=len(worked_days[i.id]),
            highlight_days=highlight_days[i.id],
        )
        for i in initiatives
    ]
    return sorted(out, key=lambda m: (-m.actual_minutes, -m.planned_minutes, m.title))
