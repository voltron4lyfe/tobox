from datetime import UTC, date, datetime

from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session

from tobox import services
from tobox.api.deps import SessionDep, get_or_404
from tobox.config import get_settings
from tobox.models import Day, Initiative, LogEntry, PlannedItem
from tobox.schemas import (
    CarryForwardRequest,
    DayOut,
    DayUpdate,
    LogEntryCreate,
    LogEntryUpdate,
    PlannedItemCreate,
    PlannedItemUpdate,
    ReorderRequest,
)

router = APIRouter(tags=["days"])


def _ensure_capacity(items: list[PlannedItem], adding: int = 1) -> None:
    limit = get_settings().max_plan_items
    if len(items) + adding > limit:
        raise HTTPException(409, f"A day's plan is limited to {limit} items. Cut something first.")


@router.get("/days/{day}", response_model=DayOut)
def get_day(day: date, session: SessionDep) -> DayOut:
    return services.build_day(session, day)


@router.put("/days/{day}", response_model=DayOut)
def update_day(day: date, body: DayUpdate, session: SessionDep) -> DayOut:
    row = session.get(Day, day)
    if row is None:
        row = Day(date=day, intention="", reflection="")
        session.add(row)
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


# --- Planned items -------------------------------------------------------------


@router.post("/days/{day}/items", response_model=DayOut, status_code=201)
def add_item(day: date, body: PlannedItemCreate, session: SessionDep) -> DayOut:
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


@router.patch("/items/{item_id}", response_model=DayOut)
def update_item(item_id: int, body: PlannedItemUpdate, session: SessionDep) -> DayOut:
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


@router.delete("/items/{item_id}", response_model=DayOut)
def delete_item(item_id: int, session: SessionDep) -> DayOut:
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


@router.post("/days/{day}/items/reorder", response_model=DayOut)
def reorder_items(day: date, body: ReorderRequest, session: SessionDep) -> DayOut:
    items = services.day_items(session, day)
    by_id = {i.id: i for i in items}
    if sorted(body.ids) != sorted(by_id):
        raise HTTPException(422, "ids must be exactly the day's planned item ids")
    for rank, item_id in enumerate(body.ids):
        by_id[item_id].rank = rank
    # Ranked-first is the highlight (Ivy Lee: do the first thing first).
    if body.ids:
        services.set_highlight(items, by_id[body.ids[0]])
    session.commit()
    return services.build_day(session, day)


@router.post("/days/{day}/carry-forward", response_model=DayOut)
def carry_forward(day: date, body: CarryForwardRequest, session: SessionDep) -> DayOut:
    """Copy the day's unfinished items onto another day (skipping ones already carried)."""
    if body.to_date == day:
        raise HTTPException(422, "to_date must differ from the source day")
    source = [i for i in services.day_items(session, day) if not i.done]
    if body.item_ids is not None:
        source = [i for i in source if i.id in set(body.item_ids)]
    target = services.day_items(session, body.to_date)
    already = {i.carried_from_id for i in target}
    pending = [i for i in source if i.id not in already]
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


# --- Log entries ------------------------------------------------------------------


def _resolve_link(
    session: Session, day: date, initiative_id: int | None, planned_item_id: int | None
) -> tuple[Initiative, PlannedItem | None]:
    """Validate a log's target. A linked item must be on the same day and initiative."""
    item = get_or_404(session, PlannedItem, planned_item_id) if planned_item_id else None
    if item is not None:
        if item.date != day:
            raise HTTPException(422, "planned item belongs to a different day")
        if initiative_id is not None and initiative_id != item.initiative_id:
            raise HTTPException(422, "planned item belongs to a different initiative")
    resolved = initiative_id or (item.initiative_id if item else None)
    if resolved is None:
        raise HTTPException(422, "initiative_id or planned_item_id is required")
    return get_or_404(session, Initiative, resolved), item


@router.post("/days/{day}/logs", response_model=DayOut, status_code=201)
def add_log(day: date, body: LogEntryCreate, session: SessionDep) -> DayOut:
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


@router.patch("/logs/{log_id}", response_model=DayOut)
def update_log(log_id: int, body: LogEntryUpdate, session: SessionDep) -> DayOut:
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


@router.delete("/logs/{log_id}", response_model=DayOut)
def delete_log(log_id: int, session: SessionDep) -> DayOut:
    log = get_or_404(session, LogEntry, log_id)
    day = log.date
    session.delete(log)
    session.commit()
    return services.build_day(session, day)
