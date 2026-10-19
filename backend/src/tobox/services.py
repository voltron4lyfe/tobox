"""Day assembly: loads a day's rows and shapes them into API responses."""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from tobox.metrics import ItemFacts, LogFacts, logged_minutes_by_item, summarize_day
from tobox.models import Day, Initiative, InitiativeStatus, LogEntry, PlannedItem, Routine
from tobox.recurrence import is_due
from tobox.schemas import DayOut, DaySummary, LogEntryOut, PlannedItemOut, RoutineOut


def day_items(session: Session, day: date) -> list[PlannedItem]:
    stmt = (
        select(PlannedItem)
        .where(PlannedItem.date == day)
        .order_by(PlannedItem.is_highlight.desc(), PlannedItem.rank, PlannedItem.id)
    )
    return list(session.scalars(stmt))


def day_logs(session: Session, day: date) -> list[LogEntry]:
    stmt = select(LogEntry).where(LogEntry.date == day).order_by(LogEntry.created_at, LogEntry.id)
    return list(session.scalars(stmt))


def due_routines(session: Session, day: date, items: list[PlannedItem]) -> list[Routine]:
    """Active routines of active initiatives that are due on `day` and not yet planned."""
    planned = {i.routine_id for i in items}
    stmt = (
        select(Routine)
        .join(Initiative)
        .where(Routine.active, Initiative.status == InitiativeStatus.active)
        .order_by(Routine.id)
    )
    return [
        r
        for r in session.scalars(stmt)
        if r.id not in planned and is_due(r.weekdays, r.every_weeks, r.start_date, day)
    ]


def item_facts(item: PlannedItem) -> ItemFacts:
    return ItemFacts(
        id=item.id,
        initiative_id=item.initiative_id,
        title=item.title,
        quadrant=item.quadrant,
        estimate_minutes=item.estimate_minutes,
        is_highlight=item.is_highlight,
        done=item.done,
    )


def log_facts(log: LogEntry) -> LogFacts:
    return LogFacts(
        initiative_id=log.initiative_id,
        planned_item_id=log.planned_item_id,
        quadrant=log.quadrant,
        minutes=log.minutes,
    )


def summarize(items: list[PlannedItem], logs: list[LogEntry]) -> DaySummary:
    return summarize_day([item_facts(i) for i in items], [log_facts(lg) for lg in logs])


def build_day(session: Session, day: date) -> DayOut:
    row = session.get(Day, day) or Day(date=day, intention="", reflection="")
    items = day_items(session, day)
    logs = day_logs(session, day)
    by_item = logged_minutes_by_item(log_facts(lg) for lg in logs)
    return DayOut(
        date=day,
        intention=row.intention,
        planned_at=row.planned_at,
        reflection=row.reflection,
        rating=row.rating,
        reviewed_at=row.reviewed_at,
        items=[item_out(i, by_item.get(i.id, 0)) for i in items],
        logs=[LogEntryOut.model_validate(lg) for lg in logs],
        summary=summarize(items, logs),
        routines_due=[RoutineOut.model_validate(r) for r in due_routines(session, day, items)],
    )


def item_out(item: PlannedItem, logged_minutes: int) -> PlannedItemOut:
    fields = {k: getattr(item, k) for k in PlannedItemOut.model_fields if k != "logged_minutes"}
    return PlannedItemOut(**fields, logged_minutes=logged_minutes)


def renumber(items: list[PlannedItem]) -> None:
    """Highlight first, then preserve existing order; ranks become 0..n-1."""
    ordered = sorted(items, key=lambda i: (not i.is_highlight, i.rank, i.id))
    for rank, item in enumerate(ordered):
        item.rank = rank


def set_highlight(items: list[PlannedItem], target: PlannedItem) -> None:
    for item in items:
        item.is_highlight = item is target
    renumber(items)
