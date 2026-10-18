from datetime import date

from fastapi import APIRouter

from tobox import ops
from tobox.api.deps import SessionDep
from tobox.schemas import MetricsOut

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("", response_model=MetricsOut)
def get_metrics(start: date, end: date, session: SessionDep) -> MetricsOut:
    return ops.metrics(session, start, end)
