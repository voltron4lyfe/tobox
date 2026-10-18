from fastapi import APIRouter, Response
from sqlalchemy import func, select

from tobox.api.deps import SessionDep, get_or_404
from tobox.models import Initiative, InitiativeStatus
from tobox.schemas import InitiativeCreate, InitiativeOut, InitiativeUpdate

router = APIRouter(prefix="/initiatives", tags=["initiatives"])


@router.get("", response_model=list[InitiativeOut])
def list_initiatives(session: SessionDep, include_archived: bool = False) -> list[Initiative]:
    stmt = select(Initiative).order_by(Initiative.quadrant, Initiative.sort_order, Initiative.id)
    if not include_archived:
        stmt = stmt.where(Initiative.status != InitiativeStatus.archived)
    return list(session.scalars(stmt))


@router.post("", response_model=InitiativeOut, status_code=201)
def create_initiative(body: InitiativeCreate, session: SessionDep) -> Initiative:
    max_order = session.scalar(
        select(func.max(Initiative.sort_order)).where(Initiative.quadrant == body.quadrant)
    )
    initiative = Initiative(**body.model_dump(), sort_order=(max_order or 0) + 1)
    session.add(initiative)
    session.commit()
    return initiative


@router.patch("/{initiative_id}", response_model=InitiativeOut)
def update_initiative(
    initiative_id: int, body: InitiativeUpdate, session: SessionDep
) -> Initiative:
    initiative = get_or_404(session, Initiative, initiative_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(initiative, key, value)
    session.commit()
    return initiative


@router.delete("/{initiative_id}", status_code=204)
def delete_initiative(initiative_id: int, session: SessionDep) -> Response:
    session.delete(get_or_404(session, Initiative, initiative_id))
    session.commit()
    return Response(status_code=204)
