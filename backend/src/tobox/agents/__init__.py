"""AI-agent access: an MCP server at /mcp protected by Tobox's own OAuth authorization server.

`mount` registers, on the FastAPI app:
  /mcp                                        streamable HTTP MCP endpoint (Bearer required)
  /.well-known/oauth-protected-resource/mcp  RFC 9728 metadata pointing agents at the issuer
  /.well-known/oauth-authorization-server     RFC 8414 metadata
  /register /authorize /token /revoke          OAuth endpoints (dynamic client registration)
  /oauth/consent                              the owner's approve/deny page
"""

from collections.abc import Callable
from contextlib import AbstractAsyncContextManager

from fastapi import FastAPI
from mcp.server.auth.settings import AuthSettings, ClientRegistrationOptions, RevocationOptions
from mcp.server.transport_security import TransportSecuritySettings
from sqlalchemy.orm import Session
from starlette.routing import Route

from tobox.agents.oauth import READ, SCOPES, TokenStore, consent_router
from tobox.agents.server import build_server
from tobox.config import Settings


def mount(
    app: FastAPI, session_factory: Callable[[], Session], settings: Settings
) -> Callable[[], AbstractAsyncContextManager[None]]:
    """Attach MCP + OAuth routes; returns the session-manager context for the app lifespan."""
    base = settings.public_url.rstrip("/")
    server = build_server(
        session_factory,
        settings.version,
        auth_server_provider=TokenStore(session_factory, settings),
        # Validated from strings so a path-less issuer keeps its exact form (no trailing
        # slash): RFC 8414 issuer comparison is exact.
        auth=AuthSettings.model_validate(
            {
                "issuer_url": base,
                "resource_server_url": f"{base}/mcp",
                "validate_token_resource": True,
                "required_scopes": [READ],
                "client_registration_options": ClientRegistrationOptions(
                    enabled=True, valid_scopes=SCOPES, default_scopes=SCOPES
                ),
                "revocation_options": RevocationOptions(enabled=True),
            }
        ),
    )
    mcp_app = server.streamable_http_app(
        streamable_http_path="/mcp",
        stateless_http=True,
        json_response=True,
        # Bearer tokens already gate every call; Host checks would break reverse proxies.
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    )
    # Expose each MCP/OAuth path on the main app, all dispatching into the MCP Starlette app so
    # its auth middleware applies. Registered before the SPA catch-all, so they take priority.
    for route in mcp_app.routes:
        if isinstance(route, Route):
            app.router.routes.append(Route(route.path, endpoint=mcp_app, methods=None))
    app.include_router(consent_router(session_factory, settings))
    return server.session_manager.run
