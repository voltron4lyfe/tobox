from fastapi import APIRouter, Response

from tobox import ops
from tobox.api.deps import SessionDep
from tobox.models import Role
from tobox.schemas import RoleCreate, RoleOut, RoleUpdate

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("", response_model=list[RoleOut])
def list_roles(session: SessionDep) -> list[Role]:
    return ops.list_roles(session)


@router.post("", response_model=RoleOut, status_code=201)
def create_role(body: RoleCreate, session: SessionDep) -> Role:
    return ops.create_role(session, body)


@router.patch("/{role_id}", response_model=RoleOut)
def update_role(role_id: int, body: RoleUpdate, session: SessionDep) -> Role:
    return ops.update_role(session, role_id, body)


@router.delete("/{role_id}", status_code=204)
def delete_role(role_id: int, session: SessionDep) -> Response:
    """Its initiatives stay, without a role."""
    ops.delete_role(session, role_id)
    return Response(status_code=204)
