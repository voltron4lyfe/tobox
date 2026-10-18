from datetime import date

from fastapi import APIRouter

from tobox import ops, services
from tobox.api.deps import SessionDep
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


@router.get("/days/{day}", response_model=DayOut)
def get_day(day: date, session: SessionDep) -> DayOut:
    return services.build_day(session, day)


@router.put("/days/{day}", response_model=DayOut)
def update_day(day: date, body: DayUpdate, session: SessionDep) -> DayOut:
    return ops.update_day(session, day, body)


@router.post("/days/{day}/items", response_model=DayOut, status_code=201)
def add_item(day: date, body: PlannedItemCreate, session: SessionDep) -> DayOut:
    return ops.add_item(session, day, body)


@router.patch("/items/{item_id}", response_model=DayOut)
def update_item(item_id: int, body: PlannedItemUpdate, session: SessionDep) -> DayOut:
    return ops.update_item(session, item_id, body)


@router.delete("/items/{item_id}", response_model=DayOut)
def delete_item(item_id: int, session: SessionDep) -> DayOut:
    return ops.delete_item(session, item_id)


@router.post("/days/{day}/items/reorder", response_model=DayOut)
def reorder_items(day: date, body: ReorderRequest, session: SessionDep) -> DayOut:
    return ops.reorder_items(session, day, body.ids)


@router.post("/days/{day}/carry-forward", response_model=DayOut)
def carry_forward(day: date, body: CarryForwardRequest, session: SessionDep) -> DayOut:
    """Copy the day's unfinished items onto another day (skipping ones already carried)."""
    return ops.carry_forward(session, day, body)


@router.post("/days/{day}/logs", response_model=DayOut, status_code=201)
def add_log(day: date, body: LogEntryCreate, session: SessionDep) -> DayOut:
    return ops.add_log(session, day, body)


@router.patch("/logs/{log_id}", response_model=DayOut)
def update_log(log_id: int, body: LogEntryUpdate, session: SessionDep) -> DayOut:
    return ops.update_log(session, log_id, body)


@router.delete("/logs/{log_id}", response_model=DayOut)
def delete_log(log_id: int, session: SessionDep) -> DayOut:
    return ops.delete_log(session, log_id)
