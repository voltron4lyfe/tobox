"""Who may use Tobox: the owner-password sign-in, and request guards that apply to every route.

Trust model: with `TOBOX_OWNER_PASSWORD` unset, anyone who can reach Tobox is the owner (a
localhost install, or one behind an authenticating reverse proxy). With it set, the web UI and
REST API need a signed-in browser (an HMAC-signed, HttpOnly, SameSite=Lax cookie), and AI
agents need the owner's approval (`agents/oauth.py`). In both modes `RequestGuard` refuses
unknown Host headers (DNS rebinding) and cross-site writes to /api (CSRF).
"""

import hashlib
import hmac
import secrets
import time
from collections import deque
from datetime import timedelta
from urllib.parse import urlsplit

import anyio
from fastapi import Request, Response
from sqlalchemy.orm import Session
from starlette.datastructures import Headers
from starlette.responses import JSONResponse, PlainTextResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from tobox.api.deps import SessionDep
from tobox.config import Settings
from tobox.db import insert_if_missing
from tobox.errors import DomainError
from tobox.models import AppState

COOKIE = "tobox_session"
SESSION_TTL = timedelta(days=30)
SECRET_KEY = "session_secret"
# Sent by the web client on every write. A custom header can't be added cross-site without a
# CORS preflight, which Tobox never grants to other origins.
CSRF_HEADER = "x-requested-with"
CSRF_VALUE = "tobox"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class UnauthorizedError(DomainError):
    status_code = 401


class TooManyAttemptsError(DomainError):
    status_code = 429


# --- Password checks -------------------------------------------------------------------------


class PasswordGuard:
    """Owner-password checks, serialized and rate limited across every caller.

    Attempts run one at a time and each failure costs `delay`, so parallel requests can't
    multiply the guess rate; after `max_failures` within `window` all attempts are refused
    until the oldest failure ages out.
    """

    def __init__(
        self,
        *,
        max_failures: int = 10,
        window: timedelta = timedelta(minutes=15),
        delay: float = 1.0,
    ) -> None:
        self.max_failures = max_failures
        self.window = window.total_seconds()
        self.delay = delay
        self._failures: deque[float] = deque()
        self._lock = anyio.Lock()

    async def verify(self, attempt: str, expected: str) -> bool:
        async with self._lock:
            now = time.monotonic()
            while self._failures and now - self._failures[0] > self.window:
                self._failures.popleft()
            if len(self._failures) >= self.max_failures:
                raise TooManyAttemptsError("Too many wrong passwords. Try again in a few minutes.")
            if hmac.compare_digest(attempt.encode(), expected.encode()):
                return True
            self._failures.append(now)
            await anyio.sleep(self.delay)
            return False


# --- Session cookie --------------------------------------------------------------------------


def _secret(session: Session) -> bytes:
    """A random signing key, generated once and kept in app_state."""
    row = session.get(AppState, SECRET_KEY)
    if row is None:
        # Two first requests may race to create it; whichever insert lands first wins.
        insert_if_missing(session, AppState, key=SECRET_KEY, value=secrets.token_hex(32))
        session.commit()
        row = session.get(AppState, SECRET_KEY)
        assert row is not None
    return row.value.encode()


def _signature(session: Session, password: str, expires: int) -> str:
    # Binding the password's digest means changing the password signs everyone out.
    pw = hashlib.sha256(password.encode()).hexdigest()
    return hmac.new(_secret(session), f"{expires}|{pw}".encode(), hashlib.sha256).hexdigest()


def signed_in(request: Request, session: Session, settings: Settings) -> bool:
    """Whether this request comes from the owner (always true without a password)."""
    if not settings.owner_password:
        return True
    expires, _, signature = request.cookies.get(COOKIE, "").partition(".")
    if not expires.isdigit() or int(expires) < time.time():
        return False
    expected = _signature(session, settings.owner_password, int(expires))
    return hmac.compare_digest(signature, expected)


def _secure(settings: Settings) -> bool:
    return settings.public_url.startswith("https://")


def set_session_cookie(response: Response, session: Session, settings: Settings) -> None:
    assert settings.owner_password
    expires = int(time.time() + SESSION_TTL.total_seconds())
    response.set_cookie(
        COOKIE,
        f"{expires}.{_signature(session, settings.owner_password, expires)}",
        max_age=int(SESSION_TTL.total_seconds()),
        httponly=True,
        # Lax, not Strict: the consent page is reached by a cross-site redirect from the agent
        # and must see that the browser is signed in. Writes are CSRF-guarded separately.
        samesite="lax",
        secure=_secure(settings),
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(COOKIE, httponly=True, samesite="lax", secure=_secure(settings))


def require_owner(request: Request, session: SessionDep) -> None:
    """Dependency for every /api route except health and sign-in."""
    if not signed_in(request, session, request.app.state.settings):
        raise UnauthorizedError("Sign in to Tobox first.")


# --- Request guard ---------------------------------------------------------------------------


def allowed_hosts(settings: Settings) -> set[str]:
    hosts = {"localhost", "127.0.0.1", "::1", *(h.lower() for h in settings.allowed_hosts)}
    if public := urlsplit(settings.public_url).hostname:
        hosts.add(public)
    return hosts


class RequestGuard:
    """ASGI middleware: refuse unknown Host headers, and /api writes without the CSRF header.

    The Host check stops DNS rebinding, where a malicious page re-points its own domain at
    Tobox to read and write it from the owner's browser. `*` in allowed_hosts disables it.
    """

    def __init__(self, app: ASGIApp, settings: Settings) -> None:
        self.app = app
        self.hosts = allowed_hosts(settings)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = Headers(scope=scope)
        host = urlsplit("//" + headers.get("host", "")).hostname or ""
        if "*" not in self.hosts and host not in self.hosts:
            response: Response = PlainTextResponse(
                f"Host {host!r} is not allowed. Set TOBOX_PUBLIC_URL to the URL you open Tobox "
                "at, or add the host to TOBOX_ALLOWED_HOSTS.",
                400,
            )
            await response(scope, receive, send)
            return
        path: str = scope["path"]
        if (
            path.startswith("/api/")
            and scope["method"] not in SAFE_METHODS
            and headers.get(CSRF_HEADER) != CSRF_VALUE
        ):
            response = JSONResponse(
                {"detail": f"Missing {CSRF_HEADER}: {CSRF_VALUE} header"}, status_code=403
            )
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)
