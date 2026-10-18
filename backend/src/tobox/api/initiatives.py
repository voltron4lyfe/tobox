from fastapi import APIRouter, Response

from tobox import ops
from tobox.api.deps import SessionDep
from tobox.models import Initiative
from tobox.schemas import InitiativeCreate, InitiativeOut, InitiativeUpdate

router = APIRouter(prefix="/initiatives", tags=["initiatives"])


@router.get("", response_model=list[InitiativeOut])
def list_initiatives(session: SessionDep, include_archived: bool = False) -> list[Initiative]:
    return ops.list_initiatives(session, include_archived)


@router.post("", response_model=InitiativeOut, status_code=201)
def create_initiative(body: InitiativeCreate, session: SessionDep) -> Initiative:
    return ops.create_initiative(session, body)


@router.patch("/{initiative_id}", response_model=InitiativeOut)
def update_initiative(
    initiative_id: int, body: InitiativeUpdate, session: SessionDep
) -> Initiative:
    return ops.update_initiative(session, initiative_id, body)


@router.delete("/{initiative_id}", status_code=204)
def delete_initiative(initiative_id: int, session: SessionDep) -> Response:
    ops.delete_initiative(session, initiative_id)
    return Response(status_code=204)
