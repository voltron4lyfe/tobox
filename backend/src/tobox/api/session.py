from fastapi import APIRouter, Request, Response

from tobox import auth
from tobox.api.deps import SessionDep
from tobox.config import Settings
from tobox.schemas import SessionInfo, SignInRequest

router = APIRouter(prefix="/session", tags=["session"])


@router.get("", response_model=SessionInfo)
def get_session_info(request: Request, response: Response, session: SessionDep) -> SessionInfo:
    """Whether a sign-in is needed. Renews the cookie, so active browsers stay signed in."""
    settings: Settings = request.app.state.settings
    ok = auth.signed_in(request, session, settings)
    if ok and settings.owner_password:
        auth.set_session_cookie(response, session, settings)
    return SessionInfo(password_required=bool(settings.owner_password), signed_in=ok)


@router.post("", response_model=SessionInfo)
async def sign_in(
    body: SignInRequest, request: Request, response: Response, session: SessionDep
) -> SessionInfo:
    settings: Settings = request.app.state.settings
    if not settings.owner_password:
        return SessionInfo(password_required=False, signed_in=True)
    guard: auth.PasswordGuard = request.app.state.password_guard
    if not await guard.verify(body.password, settings.owner_password):
        raise auth.UnauthorizedError("Wrong password.")
    auth.set_session_cookie(response, session, settings)
    return SessionInfo(password_required=True, signed_in=True)


@router.delete("", status_code=204)
def sign_out(request: Request) -> Response:
    response = Response(status_code=204)
    auth.clear_session_cookie(response, request.app.state.settings)
    return response
