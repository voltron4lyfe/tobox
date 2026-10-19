from fastapi import APIRouter, Request, Response
from sqlalchemy import delete

from tobox.agents.oauth import active_agents, client_name
from tobox.api.deps import SessionDep
from tobox.config import Settings
from tobox.errors import NotFoundError
from tobox.models import OAuthClient, OAuthGrant, OAuthToken
from tobox.schemas import AgentOut, McpInfo

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=list[AgentOut])
def list_agents(session: SessionDep) -> list[AgentOut]:
    """AI agents currently holding a valid token."""
    out = []
    for client, tokens in active_agents(session):
        used = [t.last_used_at for t in tokens if t.last_used_at]
        out.append(
            AgentOut(
                client_id=client.client_id,
                name=client_name(client.info),
                scopes=sorted({sc for t in tokens for sc in t.scopes.split()}),
                connected_at=min(t.created_at for t in tokens),
                last_used_at=max(used) if used else None,
            )
        )
    return sorted(out, key=lambda a: a.connected_at, reverse=True)


@router.delete("/{client_id}", status_code=204)
def disconnect_agent(client_id: str, session: SessionDep) -> Response:
    """Revoke every token of an agent and forget its registration."""
    # Explicit deletes rather than relying on FK cascades (SQLite enforces them per connection).
    session.execute(delete(OAuthToken).where(OAuthToken.client_id == client_id))
    session.execute(delete(OAuthGrant).where(OAuthGrant.client_id == client_id))
    result = session.execute(delete(OAuthClient).where(OAuthClient.client_id == client_id))
    if getattr(result, "rowcount", 0) == 0:
        raise NotFoundError(f"agent {client_id} not found")
    session.commit()
    return Response(status_code=204)


@router.get("/mcp", response_model=McpInfo)
def mcp_info(request: Request) -> McpInfo:
    """Where agents connect, and whether approving them can need the owner password."""
    settings: Settings = request.app.state.settings
    base = settings.public_url.rstrip("/")
    return McpInfo(url=f"{base}/mcp", issuer=base, password_required=bool(settings.owner_password))
