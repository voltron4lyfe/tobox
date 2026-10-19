"""AI-agent access: the OAuth handshake end to end, then MCP tools over streamable HTTP."""

import base64
import hashlib
import json
import re
import secrets
from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from tests.conftest import DAY
from tobox.auth import PasswordGuard

REDIRECT = "http://localhost:9999/callback"
RESOURCE = "http://localhost:8000/mcp"


def _qs(url: str) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(urlparse(url).query).items()}


def consent_path(location: str) -> str:
    return urlparse(location).path + "?" + urlparse(location).query


class Agent:
    """A minimal public OAuth client (PKCE, no secret), like Claude or an IDE agent."""

    def __init__(self, client: TestClient, name: str = "Test Agent") -> None:
        self.c = client
        res = client.post(
            "/register",
            json={
                "redirect_uris": [REDIRECT],
                "client_name": name,
                "token_endpoint_auth_method": "none",
                "grant_types": ["authorization_code", "refresh_token"],
                "response_types": ["code"],
            },
        )
        assert res.status_code == 201, res.text
        self.client_id: str = res.json()["client_id"]
        self.access = ""
        self.refresh = ""
        self.verifier = ""

    def start(self, resource: str = RESOURCE) -> str:
        """GET /authorize; returns where the browser is sent (the consent page)."""
        self.verifier = secrets.token_urlsafe(48)
        digest = hashlib.sha256(self.verifier.encode()).digest()
        challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
        res = self.c.get(
            "/authorize",
            params={
                "response_type": "code",
                "client_id": self.client_id,
                "redirect_uri": REDIRECT,
                "code_challenge": challenge,
                "code_challenge_method": "S256",
                "state": "st4te",
                "scope": "tobox:read tobox:write",
                "resource": resource,
            },
            follow_redirects=False,
        )
        assert res.status_code == 302, res.text
        return str(res.headers["location"])

    def consent(
        self,
        location: str,
        *,
        browser: TestClient | None = None,
        password: str = "",
        write: bool = True,
        action: str = "approve",
    ) -> Any:
        """Open the consent page in the owner's browser (signed in by default) and submit it."""
        browser = browser or self.c
        page = browser.get(consent_path(location))
        assert page.status_code == 200, page.text
        csrf = re.search(r'name="csrf" value="([^"]+)"', page.text)
        assert csrf
        form = {
            "request": _qs(location)["request"],
            "csrf": csrf[1],
            "action": action,
            "password": password,
        }
        if write:
            form["allow_write"] = "1"
        return browser.post("/oauth/consent", data=form, follow_redirects=False)

    def exchange(self, code: str) -> Any:
        return self.c.post(
            "/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": REDIRECT,
                "client_id": self.client_id,
                "code_verifier": self.verifier,
                "resource": RESOURCE,
            },
        )

    def connect(self, *, write: bool = True) -> "Agent":
        res = self.consent(self.start(), write=write)
        assert res.status_code == 303, res.text
        params = _qs(res.headers["location"])
        assert params["state"] == "st4te"
        tokens = self.exchange(params["code"])
        assert tokens.status_code == 200, tokens.text
        self.access = tokens.json()["access_token"]
        self.refresh = tokens.json()["refresh_token"]
        return self

    def rpc(self, method: str, params: dict[str, Any] | None = None) -> Any:
        return self.c.post(
            "/mcp",
            headers={
                "Authorization": f"Bearer {self.access}",
                "Accept": "application/json, text/event-stream",
            },
            json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}},
        )

    def call(self, tool: str, **args: Any) -> dict[str, Any]:
        res = self.rpc("tools/call", {"name": tool, "arguments": args})
        assert res.status_code == 200, res.text
        return dict(res.json()["result"])


def data(result: dict[str, Any]) -> Any:
    assert not result.get("isError"), result
    return result.get("structuredContent") or json.loads(result["content"][0]["text"])


def error_text(result: dict[str, Any]) -> str:
    assert result.get("isError"), result
    return str(result["content"][0]["text"])


@pytest.fixture
def agent(client: TestClient) -> Agent:
    return Agent(client).connect()


# --- Discovery and the handshake -----------------------------------------------------------


def test_mcp_requires_a_token_and_points_to_metadata(client: TestClient) -> None:
    res = client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    assert res.status_code == 401
    assert "/.well-known/oauth-protected-resource/mcp" in res.headers["www-authenticate"]


def test_metadata_advertises_exact_issuer(client: TestClient) -> None:
    resource = client.get("/.well-known/oauth-protected-resource/mcp").json()
    assert resource["resource"] == RESOURCE
    assert resource["authorization_servers"] == ["http://localhost:8000"]
    server = client.get("/.well-known/oauth-authorization-server").json()
    assert server["issuer"] == "http://localhost:8000"
    assert server["registration_endpoint"] == "http://localhost:8000/register"
    assert set(server["scopes_supported"]) == {"tobox:read", "tobox:write"}


def test_consent_page_names_the_agent_and_cannot_be_framed(client: TestClient) -> None:
    location = Agent(client, name="Claude <script>").start()
    page = client.get(consent_path(location))
    assert page.status_code == 200
    assert "Claude &lt;script&gt;" in page.text
    assert "localhost" in page.text  # where approval sends you
    assert page.headers["x-frame-options"] == "DENY"


def test_signed_in_browser_approves_without_password(client: TestClient) -> None:
    page = client.get(consent_path(Agent(client).start()))
    assert 'name="password"' not in page.text
    assert Agent(client).connect().access


def test_other_browser_needs_the_password(client: TestClient, anon: TestClient) -> None:
    a = Agent(client)
    location = a.start()
    assert 'name="password"' in anon.get(consent_path(location)).text
    res = a.consent(location, browser=anon, password="nope")
    assert res.status_code == 403
    assert "Wrong password" in res.text
    res = a.consent(location, browser=anon, password="hunter2")
    assert res.status_code == 303
    assert "code" in _qs(res.headers["location"])


def test_password_attempts_are_rate_limited(client: TestClient, anon: TestClient) -> None:
    client.app.state.password_guard = PasswordGuard(max_failures=2, delay=0)  # type: ignore[attr-defined]
    a = Agent(client)
    location = a.start()
    for _ in range(2):
        assert "Wrong password" in a.consent(location, browser=anon, password="x").text
    # Locked out, even with the right password, until the failures age out.
    res = a.consent(location, browser=anon, password="hunter2")
    assert res.status_code == 403
    assert "Too many wrong passwords" in res.text


def test_consent_rejects_cross_site_posts(client: TestClient) -> None:
    """A page elsewhere can learn a pending request id, but not the form's token."""
    a = Agent(client)
    request_id = _qs(a.start())["request"]
    form = {"request": request_id, "action": "approve", "allow_write": "1"}
    forged = client.post("/oauth/consent", data=form, follow_redirects=False)
    assert forged.status_code == 403
    # Even with a token from its own visit, the browser's Sec-Fetch-Site gives it away.
    page = client.get(consent_path(a.start()))
    csrf = re.search(r'name="csrf" value="([^"]+)"', page.text)
    assert csrf
    forged = client.post(
        "/oauth/consent",
        data={**form, "csrf": csrf[1]},
        headers={"Sec-Fetch-Site": "cross-site"},
        follow_redirects=False,
    )
    assert forged.status_code == 403
    assert "didn't come from Tobox" in forged.text


def test_deny_redirects_with_access_denied(client: TestClient) -> None:
    a = Agent(client)
    res = a.consent(a.start(), action="deny")
    assert res.status_code == 303
    assert _qs(res.headers["location"]) == {"error": "access_denied", "state": "st4te"}


def test_tokens_for_another_resource_are_refused(client: TestClient) -> None:
    location = Agent(client).start(resource="https://evil.example/mcp")
    assert location.startswith(REDIRECT)
    assert _qs(location)["error"] == "invalid_target"


def test_codes_are_single_use(client: TestClient) -> None:
    a = Agent(client)
    code = _qs(a.consent(a.start()).headers["location"])["code"]
    assert a.exchange(code).status_code == 200
    assert a.exchange(code).status_code == 400


def test_refresh_rotates_tokens(client: TestClient, agent: Agent) -> None:
    old_access, old_refresh = agent.access, agent.refresh
    res = client.post(
        "/token",
        data={
            "grant_type": "refresh_token",
            "client_id": agent.client_id,
            "refresh_token": old_refresh,
        },
    )
    assert res.status_code == 200, res.text
    agent.access = res.json()["access_token"]
    assert agent.rpc("tools/list").status_code == 200
    # The previous pair is gone.
    agent.access = old_access
    assert agent.rpc("tools/list").status_code == 401
    again = client.post(
        "/token",
        data={
            "grant_type": "refresh_token",
            "client_id": agent.client_id,
            "refresh_token": old_refresh,
        },
    )
    assert again.status_code == 400


def test_disconnecting_an_agent_revokes_it(client: TestClient, agent: Agent) -> None:
    listed = client.get("/api/agents").json()
    assert [a["name"] for a in listed] == ["Test Agent"]
    assert listed[0]["scopes"] == ["tobox:read", "tobox:write"]
    assert client.delete(f"/api/agents/{agent.client_id}").status_code == 204
    assert client.get("/api/agents").json() == []
    assert agent.rpc("tools/list").status_code == 401


def test_mcp_info_reports_connection_url(client: TestClient) -> None:
    info = client.get("/api/agents/mcp").json()
    assert info == {"url": RESOURCE, "issuer": "http://localhost:8000", "password_required": True}


# --- Tools -------------------------------------------------------------------------------------


def test_lists_tools_and_prompts(agent: Agent) -> None:
    tools = {t["name"]: t for t in agent.rpc("tools/list").json()["result"]["tools"]}
    assert {"get_day", "log_work", "add_plan_item", "update_day", "get_metrics"} <= set(tools)
    assert tools["get_day"]["annotations"]["readOnlyHint"] is True
    assert tools["delete_log"]["annotations"]["destructiveHint"] is True
    prompts = {p["name"] for p in agent.rpc("prompts/list").json()["result"]["prompts"]}
    assert prompts == {"end_of_day_review", "morning_plan"}


def test_agent_plans_logs_and_reviews_a_day(client: TestClient, agent: Agent) -> None:
    book = data(agent.call("create_initiative", title="Write book", quadrant=2))
    email = data(agent.call("create_initiative", title="Email", quadrant=3))

    day = data(
        agent.call(
            "add_plan_item",
            date=DAY,
            initiative_id=book["id"],
            title="Draft chapter 3",
            estimate_minutes=90,
        )
    )
    item = day["items"][0]
    assert item["is_highlight"] is True

    data(
        agent.call(
            "log_work",
            date=DAY,
            planned_item_id=item["id"],
            minutes=60,
            title="Drafted intro",
            mark_done=True,
        )
    )
    day = data(agent.call("log_work", date=DAY, initiative_id=email["id"], minutes=30))
    assert day["summary"]["actual_minutes"] == 90
    assert day["summary"]["verdict"] == "done"

    data(
        agent.call("update_day", date=DAY, reflection="Good focus.", rating=4, review_complete=True)
    )
    # The web UI sees exactly what the agent wrote.
    rest = client.get(f"/api/days/{DAY}").json()
    assert rest["rating"] == 4
    assert rest["reviewed_at"] is not None
    assert [lg["title"] for lg in rest["logs"]] == ["Drafted intro", "Email"]

    metrics = data(agent.call("get_metrics", days=1, end=DAY))
    assert metrics["summary"]["highlight_hit_rate"] == 1.0


def test_domain_rules_surface_as_tool_errors(agent: Agent) -> None:
    init = data(agent.call("create_initiative", title="Many", quadrant=1))
    for n in range(6):
        data(agent.call("add_plan_item", date=DAY, initiative_id=init["id"], title=f"#{n}"))
    message = error_text(agent.call("add_plan_item", date=DAY, initiative_id=init["id"]))
    assert "limited to 6" in message
    assert "invalid date" in error_text(agent.call("get_day", date="tomorrow"))


def test_read_only_grant_cannot_write(client: TestClient) -> None:
    reader = Agent(client, name="Reader").connect(write=False)
    assert data(reader.call("get_day", date=DAY))["date"] == DAY
    assert "read-only" in error_text(reader.call("create_initiative", title="X", quadrant=2))


def test_end_of_day_prompt_mentions_external_sources(agent: Agent) -> None:
    res = agent.rpc("prompts/get", {"name": "end_of_day_review", "arguments": {"date": DAY}})
    text = res.json()["result"]["messages"][0]["content"]["text"]
    assert DAY in text
    assert "Glean" in text
    assert "log_work" in text


@pytest.mark.parametrize("tool", ["get_day", "list_initiatives", "get_metrics"])
def test_read_tools_work_on_empty_db(agent: Agent, tool: str) -> None:
    assert not agent.call(tool).get("isError")
