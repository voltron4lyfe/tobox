"""Domain operations: every rule-bearing write and report, shared by the REST routers and MCP tools.

Functions take a session plus validated request schemas, commit, and return API response models.
They raise `tobox.errors` exceptions, never HTTP ones, so any transport can map them.
"""

from collections import defaultdict
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from tobox import services
from tobox.config import get_settings
from tobox.db import insert_if_missing
from tobox.errors import ConflictError, InvalidError, get_or_404
from tobox.metrics import summarize_range
from tobox.models import Day, Initiative, InitiativeStatus, LogEntry, PlannedItem
from tobox.schemas import (
    CarryForwardRequest,
    DayMetrics,
    DayOut,
    DayUpdate,
    InitiativeCreate,
    InitiativeMetrics,
    InitiativeUpdate,
    LogEntryCreate,
    LogEntryUpdate,
    MetricsOut,
    PlannedItemCreate,
    PlannedItemUpdate,
)

MAX_RANGE_DAYS = 3 * 366


# --- Initiatives -----------------------------------------------------------------


def list_initiatives(session: Session, include_archived: bool = False) -> list[Initiative]:
    stmt = select(Initiative).order_by(Initiative.quadrant, Initiative.sort_order, Initiative.id)
    if not include_archived:
        stmt = stmt.where(Initiative.status != InitiativeStatus.archived)
    return list(session.scalars(stmt))


def create_initiative(session: Session, body: InitiativeCreate) -> Initiative:
    max_order = session.scalar(
        select(func.max(Initiative.sort_order)).where(Initiative.quadrant == body.quadrant)
    )
    initiative = Initiative(**body.model_dump(), sort_order=(max_order or 0) + 1)
    session.add(initiative)
    session.commit()
    return initiative


def update_initiative(session: Session, initiative_id: int, body: InitiativeUpdate) -> Initiative:
    initiative = get_or_404(session, Initiative, initiative_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(initiative, key, value)
    session.commit()
    return initiative


def delete_initiative(session: Session, initiative_id: int) -> None:
    session.delete(get_or_404(session, Initiative, initiative_id))
    session.commit()


# --- Days ------------------------------------------------------------------------


def _ensure_day(session: Session, day: date) -> Day:
    """The day's row, created if missing. An upsert, so concurrent first writes (the UI's
    autosave and an agent, say) both succeed instead of one hitting a primary-key conflict."""
    if (row := session.get(Day, day)) is not None:
        return row
    insert_if_missing(session, Day, date=day, intention="", reflection="")
    row = session.get(Day, day)
    assert row is not None
    return row


def update_day(session: Session, day: date, body: DayUpdate) -> DayOut:
    row = _ensure_day(session, day)
    data = body.model_dump(exclude_unset=True)
    now = datetime.now(UTC)
    if "planned" in data:
        row.planned_at = now if data.pop("planned") else None
    if "reviewed" in data:
        row.reviewed_at = now if data.pop("reviewed") else None
    for key, value in data.items():
        setattr(row, key, value)
    session.commit()
    return services.build_day(session, day)


def _ensure_capacity(items: list[PlannedItem], adding: int = 1) -> None:
    limit = get_settings().max_plan_items
    if len(items) + adding > limit:
        raise ConflictError(f"A day's plan is limited to {limit} items. Cut something first.")


# --- Planned items -----------------------------------------------------------------


def add_item(session: Session, day: date, body: PlannedItemCreate) -> DayOut:
    initiative = get_or_404(session, Initiative, body.initiative_id)
    items = services.day_items(session, day)
    _ensure_capacity(items)
    item = PlannedItem(
        date=day,
        initiative_id=initiative.id,
        title=body.title.strip() or initiative.title,
        quadrant=initiative.quadrant,
        estimate_minutes=body.estimate_minutes,
        rank=len(items),
    )
    session.add(item)
    items.append(item)
    # The first item of the day is the highlight unless the caller says otherwise.
    if body.is_highlight or not any(i.is_highlight for i in items):
        services.set_highlight(items, item)
    session.commit()
    return services.build_day(session, day)


def update_item(session: Session, item_id: int, body: PlannedItemUpdate) -> DayOut:
    item = get_or_404(session, PlannedItem, item_id)
    data = body.model_dump(exclude_unset=True)
    if (initiative_id := data.pop("initiative_id", None)) is not None:
        initiative = get_or_404(session, Initiative, initiative_id)
        item.initiative_id = initiative.id
        item.quadrant = initiative.quadrant
    if (is_highlight := data.pop("is_highlight", None)) is not None:
        items = services.day_items(session, item.date)
        if is_highlight:
            services.set_highlight(items, item)
        elif item.is_highlight:
            # A day with items always has a highlight: hand it to the next-ranked item.
            others = [i for i in items if i is not item]
            if others:
                services.set_highlight(items, min(others, key=lambda i: i.rank))
    for key, value in data.items():
        setattr(item, key, value)
    session.commit()
    return services.build_day(session, item.date)


def delete_item(session: Session, item_id: int) -> DayOut:
    item = get_or_404(session, PlannedItem, item_id)
    day = item.date
    session.delete(item)
    session.flush()
    remaining = services.day_items(session, day)
    if remaining and not any(i.is_highlight for i in remaining):
        services.set_highlight(remaining, min(remaining, key=lambda i: i.rank))
    else:
        services.renumber(remaining)
    session.commit()
    return services.build_day(session, day)


def reorder_items(session: Session, day: date, ids: list[int]) -> DayOut:
    items = services.day_items(session, day)
    by_id = {i.id: i for i in items}
    if sorted(ids) != sorted(by_id):
        raise InvalidError("ids must be exactly the day's planned item ids")
    for rank, item_id in enumerate(ids):
        by_id[item_id].rank = rank
    # Ranked-first is the highlight (Ivy Lee: do the first thing first).
    if ids:
        services.set_highlight(items, by_id[ids[0]])
    session.commit()
    return services.build_day(session, day)


def _origin(session: Session, item: PlannedItem) -> int:
    """The id of the item a carry chain started from (the item itself if never carried)."""
    seen = {item.id}
    while item.carried_from_id is not None and item.carried_from_id not in seen:
        parent = session.get(PlannedItem, item.carried_from_id)
        if parent is None:
            break
        seen.add(parent.id)
        item = parent
    return item.id


def carry_forward(session: Session, day: date, body: CarryForwardRequest) -> DayOut:
    """Copy the day's unfinished items onto another day, skipping any task already there
    (directly or through a chain of earlier carries)."""
    if body.to_date == day:
        raise InvalidError("to_date must differ from the source day")
    source = [i for i in services.day_items(session, day) if not i.done]
    if body.item_ids is not None:
        source = [i for i in source if i.id in set(body.item_ids)]
    target = services.day_items(session, body.to_date)
    already = {_origin(session, i) for i in target}
    pending = [i for i in source if _origin(session, i) not in already]
    _ensure_capacity(target, len(pending))
    for item in pending:
        copy = PlannedItem(
            date=body.to_date,
            initiative_id=item.initiative_id,
            title=item.title,
            quadrant=item.quadrant,
            estimate_minutes=item.estimate_minutes,
            rank=len(target),
            carried_from_id=item.id,
        )
        session.add(copy)
        target.append(copy)
    if target and not any(i.is_highlight for i in target):
        services.set_highlight(target, target[0])
    session.commit()
    return services.build_day(session, body.to_date)


# --- Log entries -------------------------------------------------------------------


def _resolve_link(
    session: Session, day: date, initiative_id: int | None, planned_item_id: int | None
) -> tuple[Initiative, PlannedItem | None]:
    """Validate a log's target. A linked item must be on the same day and initiative."""
    item = get_or_404(session, PlannedItem, planned_item_id) if planned_item_id else None
    if item is not None:
        if item.date != day:
            raise InvalidError("planned item belongs to a different day")
        if initiative_id is not None and initiative_id != item.initiative_id:
            raise InvalidError("planned item belongs to a different initiative")
    resolved = initiative_id or (item.initiative_id if item else None)
    if resolved is None:
        raise InvalidError("initiative_id or planned_item_id is required")
    return get_or_404(session, Initiative, resolved), item


def add_log(session: Session, day: date, body: LogEntryCreate) -> DayOut:
    initiative, item = _resolve_link(session, day, body.initiative_id, body.planned_item_id)
    session.add(
        LogEntry(
            date=day,
            initiative_id=initiative.id,
            planned_item_id=item.id if item else None,
            title=body.title.strip() or (item.title if item else initiative.title),
            quadrant=initiative.quadrant,
            minutes=body.minutes,
        )
    )
    if item and body.mark_done:
        item.done = True
    session.commit()
    return services.build_day(session, day)


def update_log(session: Session, log_id: int, body: LogEntryUpdate) -> DayOut:
    log = get_or_404(session, LogEntry, log_id)
    data = body.model_dump(exclude_unset=True)
    if "initiative_id" in data or "planned_item_id" in data:
        initiative_id = data.pop("initiative_id", None)
        if "planned_item_id" in data:
            item_id = data.pop("planned_item_id")
        else:
            # Changing only the initiative unlinks an item that belongs to another initiative.
            current = session.get(PlannedItem, log.planned_item_id) if log.planned_item_id else None
            keep = current is not None and initiative_id in (None, current.initiative_id)
            item_id = current.id if current is not None and keep else None
        if initiative_id is None and item_id is None:
            initiative_id = log.initiative_id
        initiative, item = _resolve_link(session, log.date, initiative_id, item_id)
        log.initiative_id = initiative.id
        log.quadrant = initiative.quadrant
        log.planned_item_id = item.id if item else None
    for key, value in data.items():
        setattr(log, key, value)
    session.commit()
    return services.build_day(session, log.date)


def delete_log(session: Session, log_id: int) -> DayOut:
    log = get_or_404(session, LogEntry, log_id)
    day = log.date
    session.delete(log)
    session.commit()
    return services.build_day(session, day)


# --- Metrics -----------------------------------------------------------------------


def metrics(session: Session, start: date, end: date) -> MetricsOut:
    if end < start:
        raise InvalidError("end must be on or after start")
    if (end - start).days > MAX_RANGE_DAYS:
        raise InvalidError(f"range is limited to {MAX_RANGE_DAYS} days")

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
        summary = services.summarize(items_by_day[cursor], logs_by_day[cursor])
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
    session: Session,
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
