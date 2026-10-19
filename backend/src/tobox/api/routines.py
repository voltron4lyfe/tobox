from fastapi import APIRouter, Response

from tobox import ops
from tobox.api.deps import SessionDep
from tobox.models import Routine
from tobox.schemas import RoutineCreate, RoutineOut, RoutineUpdate

router = APIRouter(prefix="/routines", tags=["routines"])


@router.get("", response_model=list[RoutineOut])
def list_routines(session: SessionDep, include_inactive: bool = True) -> list[Routine]:
    return ops.list_routines(session, include_inactive)


@router.post("", response_model=RoutineOut, status_code=201)
def create_routine(body: RoutineCreate, session: SessionDep) -> Routine:
    return ops.create_routine(session, body)


@router.patch("/{routine_id}", response_model=RoutineOut)
def update_routine(routine_id: int, body: RoutineUpdate, session: SessionDep) -> Routine:
    return ops.update_routine(session, routine_id, body)


@router.delete("/{routine_id}", status_code=204)
def delete_routine(routine_id: int, session: SessionDep) -> Response:
    """Items already planned from it stay on their days."""
    ops.delete_routine(session, routine_id)
    return Response(status_code=204)
