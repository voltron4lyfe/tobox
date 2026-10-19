"""Built-in OAuth 2.1 authorization server for AI agents (MCP clients).

The MCP SDK provides the protocol endpoints (/register, /authorize, /token, /revoke and the
RFC 8414/9728 metadata); this module supplies storage and the human consent step:

  agent → /authorize → `authorize()` stores a pending request → /oauth/consent (owner approves)
        → auth code → /token → access + refresh tokens (hashed at rest) → Bearer on /mcp

With `TOBOX_OWNER_PASSWORD` set, approving needs it or a browser signed in to Tobox (see
`tobox.auth` for the trust model). The consent form carries a per-render token matched against a
SameSite=Strict cookie, so no other site can submit an approval through the owner's browser.
"""

import hashlib
import hmac
import html
import json
import secrets
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import anyio
from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse, Response
from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    AuthorizeError,
    OAuthAuthorizationServerProvider,
    RefreshToken,
    TokenError,
    construct_redirect_uri,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from tobox import auth
from tobox.config import Settings
from tobox.models import OAuthClient, OAuthGrant
from tobox.models import OAuthToken as TokenRow

READ, WRITE = "tobox:read", "tobox:write"
SCOPES = [READ, WRITE]
ACCESS_TTL = timedelta(hours=1)
REFRESH_TTL = timedelta(days=30)
CODE_TTL = timedelta(minutes=5)
PENDING_TTL = timedelta(minutes=15)
CSRF_COOKIE = "tobox_consent"
CONSENT_PATH = "/oauth/consent"

SessionFactory = Callable[[], Session]


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(UTC)


def _epoch(dt: datetime | None) -> int | None:
    return int(dt.timestamp()) if dt else None


class TokenStore(OAuthAuthorizationServerProvider[AuthorizationCode, RefreshToken, AccessToken]):
    def __init__(self, session_factory: SessionFactory, settings: Settings) -> None:
        self.sessions = session_factory
        self.public_url = settings.public_url.rstrip("/")
        self.resource = f"{self.public_url}/mcp"

    async def _run[T](self, fn: Callable[[Session], T]) -> T:
        def work() -> T:
            with self.sessions() as session:
                return fn(session)

        return await anyio.to_thread.run_sync(work)

    # --- Clients -----------------------------------------------------------------------

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        def fn(s: Session) -> OAuthClientInformationFull | None:
            row = s.get(OAuthClient, client_id)
            return OAuthClientInformationFull.model_validate_json(row.info) if row else None

        return await self._run(fn)

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        def fn(s: Session) -> None:
            assert client_info.client_id is not None
            s.add(OAuthClient(client_id=client_info.client_id, info=client_info.model_dump_json()))
            s.commit()

        await self._run(fn)

    # --- Authorization -------------------------------------------------------------------

    async def authorize(
        self, client: OAuthClientInformationFull, params: AuthorizationParams
    ) -> str:
        if params.resource and params.resource.rstrip("/") != self.resource:
            raise AuthorizeError(
                "invalid_target", f"this server only issues tokens for {self.resource}"
            )
        key = secrets.token_urlsafe(24)

        def fn(s: Session) -> None:
            s.execute(delete(OAuthGrant).where(OAuthGrant.expires_at < _now()))
            assert client.client_id is not None
            s.add(
                OAuthGrant(
                    key=key,
                    kind="pending",
                    client_id=client.client_id,
                    data=params.model_dump_json(),
                    expires_at=_now() + PENDING_TTL,
                )
            )
            s.commit()

        await self._run(fn)
        return f"{self.public_url}/oauth/consent?request={key}"

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> AuthorizationCode | None:
        def fn(s: Session) -> AuthorizationCode | None:
            row = s.get(OAuthGrant, _hash(authorization_code))
            if row is None or row.kind != "code" or row.client_id != client.client_id:
                return None
            if row.expires_at < _now():
                return None
            return AuthorizationCode(code=authorization_code, **json.loads(row.data))

        return await self._run(fn)

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        def fn(s: Session) -> OAuthToken:
            # Codes are single-use: deleting first means a replay finds nothing.
            deleted = s.execute(
                delete(OAuthGrant).where(OAuthGrant.key == _hash(authorization_code.code))
            )
            if getattr(deleted, "rowcount", 0) != 1:
                raise TokenError("invalid_grant", "authorization code already used")
            assert client.client_id is not None
            token = self._issue(
                s, client.client_id, authorization_code.scopes, secrets.token_hex(16)
            )
            s.commit()
            return token

        return await self._run(fn)

    # --- Tokens ----------------------------------------------------------------------------

    def _issue(self, s: Session, client_id: str, scopes: list[str], family: str) -> OAuthToken:
        access, refresh = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        now = _now()
        for raw, kind, ttl in ((access, "access", ACCESS_TTL), (refresh, "refresh", REFRESH_TTL)):
            s.add(
                TokenRow(
                    token_hash=_hash(raw),
                    kind=kind,
                    family=family,
                    client_id=client_id,
                    scopes=" ".join(scopes),
                    resource=self.resource,
                    expires_at=now + ttl,
                )
            )
        return OAuthToken(
            access_token=access,
            expires_in=int(ACCESS_TTL.total_seconds()),
            scope=" ".join(scopes),
            refresh_token=refresh,
        )

    def _load(self, s: Session, raw: str, kind: str) -> TokenRow | None:
        row = s.get(TokenRow, _hash(raw))
        if row is None or row.kind != kind:
            return None
        if row.expires_at is not None and row.expires_at < _now():
            return None
        return row

    async def load_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: str
    ) -> RefreshToken | None:
        def fn(s: Session) -> RefreshToken | None:
            row = self._load(s, refresh_token, "refresh")
            if row is None or row.client_id != client.client_id:
                return None
            return RefreshToken(
                token=refresh_token,
                client_id=row.client_id,
                scopes=row.scopes.split(),
                expires_at=_epoch(row.expires_at),
                resource=row.resource,
            )

        return await self._run(fn)

    async def exchange_refresh_token(
        self,
        client: OAuthClientInformationFull,  # noqa: ARG002
        refresh_token: RefreshToken,
        scopes: list[str],
    ) -> OAuthToken:
        def fn(s: Session) -> OAuthToken:
            row = self._load(s, refresh_token.token, "refresh")
            if row is None:
                raise TokenError("invalid_grant", "refresh token is invalid or expired")
            granted = scopes or row.scopes.split()
            if not set(granted) <= set(row.scopes.split()):
                raise TokenError("invalid_scope", "cannot widen scopes on refresh")
            # Rotate: the whole family's old tokens go, a fresh pair replaces them.
            s.execute(delete(TokenRow).where(TokenRow.family == row.family))
            token = self._issue(s, row.client_id, granted, row.family)
            s.commit()
            return token

        return await self._run(fn)

    async def load_access_token(self, token: str) -> AccessToken | None:
        def fn(s: Session) -> AccessToken | None:
            row = self._load(s, token, "access")
            if row is None:
                return None
            now = _now()
            if row.last_used_at is None or now - row.last_used_at > timedelta(minutes=1):
                row.last_used_at = now
                s.commit()
            return AccessToken(
                token=token,
                client_id=row.client_id,
                scopes=row.scopes.split(),
                expires_at=_epoch(row.expires_at),
                resource=row.resource,
            )

        return await self._run(fn)

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        def fn(s: Session) -> None:
            row = s.get(TokenRow, _hash(token.token))
            if row is not None:
                s.execute(delete(TokenRow).where(TokenRow.family == row.family))
                s.commit()

        await self._run(fn)


# --- Consent page ----------------------------------------------------------------------------


def consent_router(session_factory: SessionFactory, settings: Settings) -> APIRouter:
    router = APIRouter(include_in_schema=False)

    def pending(
        s: Session, key: str
    ) -> tuple[OAuthGrant, AuthorizationParams, OAuthClientInformationFull] | None:
        row = s.get(OAuthGrant, key)
        if row is None or row.kind != "pending" or row.expires_at < _now():
            return None
        client_row = s.get(OAuthClient, row.client_id)
        if client_row is None:
            return None
        return (
            row,
            AuthorizationParams.model_validate_json(row.data),
            OAuthClientInformationFull.model_validate_json(client_row.info),
        )

    def needs_password(request: Request, s: Session) -> bool:
        return not auth.signed_in(request, s, settings)

    def with_csrf(response: Response, token: str) -> Response:
        response.set_cookie(
            CSRF_COOKIE,
            token,
            max_age=int(PENDING_TTL.total_seconds()),
            path=CONSENT_PATH,
            httponly=True,
            samesite="strict",
            secure=settings.public_url.startswith("https://"),
        )
        return response

    @router.get(CONSENT_PATH)
    def show(request: Request) -> Response:
        request_id = request.query_params.get("request", "")
        with session_factory() as s:
            found = pending(s, request_id)
            ask = needs_password(request, s)
        if found is None:
            return _page(
                "Request expired",
                "<p>This authorization request is invalid or has expired. "
                "Start the connection again from your AI agent.</p>",
                400,
            )
        _, params, client = found
        token = secrets.token_urlsafe(24)
        page = _page(
            "Connect an AI agent",
            _consent_form(request_id, token, client, params, needs_password=ask, error=""),
        )
        return with_csrf(page, token)

    @router.post(CONSENT_PATH)
    async def decide(
        request: Request,
        request_id: str = Form(alias="request"),
        csrf: str = Form(default=""),
        action: str = Form(),
        password: str = Form(default=""),
        allow_write: str = Form(default=""),
    ) -> Response:
        cookie = request.cookies.get(CSRF_COOKIE, "")
        fetch_site = request.headers.get("sec-fetch-site", "same-origin")
        if (
            not cookie
            or not hmac.compare_digest(csrf.encode(), cookie.encode())
            or fetch_site not in ("same-origin", "none")
        ):
            return _page(
                "Request not accepted",
                "<p>This approval didn't come from Tobox's own page. "
                "Start the connection again from your AI agent.</p>",
                403,
            )
        with session_factory() as s:
            found = pending(s, request_id)
            if found is None:
                return _page("Request expired", "<p>This request has expired.</p>", 400)
            row, params, client = found
            state = params.state
            if action != "approve":
                s.delete(row)
                s.commit()
                return RedirectResponse(
                    construct_redirect_uri(
                        str(params.redirect_uri), error="access_denied", state=state
                    ),
                    303,
                )
            if needs_password(request, s):
                assert settings.owner_password
                guard: auth.PasswordGuard = request.app.state.password_guard
                try:
                    ok = await guard.verify(password, settings.owner_password)
                    reason = "Wrong password."
                except auth.TooManyAttemptsError as exc:
                    ok, reason = False, exc.detail
                if not ok:
                    return _page(
                        "Connect an AI agent",
                        _consent_form(
                            request_id, cookie, client, params, needs_password=True, error=reason
                        ),
                        403,
                    )
            requested = params.scopes or SCOPES
            scopes = [sc for sc in requested if sc != WRITE or allow_write]
            if READ not in scopes:
                scopes.insert(0, READ)
            code = secrets.token_urlsafe(32)
            data: dict[str, Any] = {
                "scopes": scopes,
                "expires_at": time.time() + CODE_TTL.total_seconds(),
                "client_id": row.client_id,
                "code_challenge": params.code_challenge,
                "redirect_uri": str(params.redirect_uri),
                "redirect_uri_provided_explicitly": params.redirect_uri_provided_explicitly,
                "resource": f"{settings.public_url.rstrip('/')}/mcp",
                "subject": "owner",
            }
            s.delete(row)
            s.add(
                OAuthGrant(
                    key=_hash(code),
                    kind="code",
                    client_id=row.client_id,
                    data=json.dumps(data),
                    expires_at=_now() + CODE_TTL,
                )
            )
            s.commit()
        return RedirectResponse(
            construct_redirect_uri(str(params.redirect_uri), code=code, state=state), 303
        )

    return router


def active_agents(s: Session) -> list[tuple[OAuthClient, list[TokenRow]]]:
    """Clients holding at least one unexpired token, with those tokens."""
    rows = s.scalars(
        select(TokenRow).where((TokenRow.expires_at.is_(None)) | (TokenRow.expires_at > _now()))
    )
    by_client: dict[str, list[TokenRow]] = {}
    for row in rows:
        by_client.setdefault(row.client_id, []).append(row)
    clients = s.scalars(select(OAuthClient).where(OAuthClient.client_id.in_(by_client)))
    return [(c, by_client[c.client_id]) for c in clients]


def client_name(info_json: str) -> str:
    info = OAuthClientInformationFull.model_validate_json(info_json)
    return info.client_name or info.client_id or "Unknown agent"


# --- HTML ------------------------------------------------------------------------------------


def _consent_form(
    request_id: str,
    csrf: str,
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    *,
    needs_password: bool,
    error: str,
) -> str:
    e = html.escape
    name = e(client.client_name or "An unnamed agent")
    host = e(params.redirect_uri.host or str(params.redirect_uri))
    wants_write = WRITE in (params.scopes or SCOPES)
    pw = (
        '<label class="field-label" for="pw">Owner password</label>'
        '<input class="field" id="pw" name="password" type="password" '
        'autocomplete="current-password" autofocus required>'
        if needs_password
        else ""
    )
    write = (
        '<label class="check"><input type="checkbox" name="allow_write" value="1" checked> '
        "<span><b>Make changes</b>: add and edit plan items, work logs, initiatives, and "
        "reviews</span></label>"
        if wants_write
        else ""
    )
    err = f'<p class="error" role="alert">{e(error)}</p>' if error else ""
    return f"""
<p class="lede"><b>{name}</b> wants to access your Tobox.</p>
<p class="muted">After approving you'll be sent back to <code>{host}</code>.
Only approve agents you started yourself.</p>
<form method="post" action="{CONSENT_PATH}">
  <input type="hidden" name="request" value="{e(request_id)}">
  <input type="hidden" name="csrf" value="{e(csrf)}">
  <fieldset>
    <legend class="field-label">It will be able to</legend>
    <label class="check"><input type="checkbox" checked disabled>
      <span><b>Read</b>: initiatives, daily plans, work logs, reviews, and metrics</span></label>
    {write}
  </fieldset>
  {pw}{err}
  <div class="actions">
    <button class="btn" name="action" value="deny" formnovalidate>Deny</button>
    <button class="btn primary" name="action" value="approve">Approve</button>
  </div>
</form>"""


def _page(title: str, body: str, status: int = 200) -> HTMLResponse:
    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)} · Tobox</title>
<style>
  :root {{ color-scheme: light dark; --canvas:#f8fafc; --surface:#fff; --ink:#0f172a;
    --muted:#64748b; --line:#e2e8f0; --accent:#0f172a; --on-accent:#fff; --danger:#e11d48; }}
  @media (prefers-color-scheme: dark) {{ :root {{ --canvas:#0b1120; --surface:#0f172a;
    --ink:#f1f5f9; --muted:#94a3b8; --line:#1e293b; --accent:#f8fafc; --on-accent:#0f172a;
    --danger:#fb7185; }} }}
  * {{ box-sizing: border-box; }}
  body {{ margin:0; min-height:100vh; display:grid; place-items:center; padding:16px;
    background:var(--canvas); color:var(--ink);
    font:15px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }}
  main {{ width:100%; max-width:26rem; background:var(--surface); border:1px solid var(--line);
    border-radius:16px; padding:24px; }}
  h1 {{ font-size:18px; margin:0 0 12px; }}
  .lede {{ font-size:16px; margin:0 0 4px; }} .muted {{ color:var(--muted); margin:0 0 16px; }}
  fieldset {{ border:0; padding:0; margin:0 0 16px; display:grid; gap:8px; }}
  .field-label {{ display:block; font-size:12px; font-weight:600; text-transform:uppercase;
    letter-spacing:.05em; color:var(--muted); margin-bottom:6px; }}
  .check {{ display:flex; gap:8px; align-items:flex-start; }}
  .check input {{ margin-top:4px; }}
  .field {{ width:100%; padding:8px 12px; border:1px solid var(--line); border-radius:8px;
    background:var(--canvas); color:var(--ink); font:inherit; margin-bottom:12px; }}
  .actions {{ display:flex; gap:8px; justify-content:flex-end; margin-top:8px; }}
  .btn {{ min-height:36px; padding:8px 14px; border-radius:8px; border:1px solid var(--line);
    background:transparent; color:var(--ink); font:inherit; font-weight:600; cursor:pointer; }}
  .btn.primary {{ background:var(--accent); color:var(--on-accent); border-color:var(--accent); }}
  .error {{ color:var(--danger); margin:0 0 8px; }}
  code {{ font-size:13px; }}
</style></head>
<body><main><h1>{html.escape(title)}</h1>{body}</main></body></html>"""
    return HTMLResponse(
        page,
        status_code=status,
        headers={
            "X-Frame-Options": "DENY",
            # No form-action: the approve POST redirects to the agent's (arbitrary) redirect URI.
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; "
            "frame-ancestors 'none'",
            "Cache-Control": "no-store",
        },
    )
