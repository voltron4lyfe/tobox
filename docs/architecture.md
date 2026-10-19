# Architecture

```
tobox/
├── backend/                 FastAPI + SQLAlchemy 2 + Alembic, managed by uv
│   ├── src/tobox/
│   │   ├── main.py          app factory; all routes under /api
│   │   ├── models.py        ORM models (Role, Initiative, Routine, Day, PlannedItem, LogEntry,
│   │   │                    app state, push subscriptions, notification log, OAuth clients…)
│   │   ├── schemas.py       Pydantic request/response models = the HTTP contract
│   │   ├── metrics.py       pure metric functions (no DB/HTTP)
│   │   ├── recurrence.py    pure routine schedule rules (is_due, due_dates)
│   │   ├── services.py      assembles a Day response from rows
│   │   ├── ops.py           domain operations shared by the REST API and MCP tools
│   │   ├── errors.py        DomainError → 404/409/422 (HTTP) or tool errors (MCP)
│   │   ├── auth.py          owner sign-in (session cookie), password rate limit, Host/CSRF guard
│   │   ├── prefs.py         the Preferences document (theme, timezone, notifications)
│   │   ├── notify/          events (pure rules) → dispatch → channels (web push, Discord);
│   │   │                    scheduler loop that fires reminders
│   │   ├── agents/          MCP server (tools + prompts) and its OAuth 2.1 authorization server
│   │   ├── api/             routers: session (sign-in), roles, initiatives, routines, days
│   │   │                    (+items, logs, routines), metrics, preferences, notifications, agents
│   │   ├── seed.py          demo data (make seed)
│   │   └── openapi.py       prints the OpenAPI schema (make api-types)
│   ├── migrations/          Alembic (render_as_batch for SQLite)
│   └── tests/               pytest: metrics unit tests, API tests, migration drift check
├── frontend/                React 19 + TypeScript + Vite + Tailwind v4
│   ├── openapi.json         generated from the backend; committed
│   ├── src/api/             schema.d.ts (generated), typed client, TanStack Query hooks
│   ├── src/lib/             pure helpers (dates, durations, quick-log parser, keys) + hooks
│   ├── src/components/      UI building blocks (AppShell, Modal, LogComposer, charts, …)
│   ├── src/pages/           Plan, Today (Track), Review, History, Initiatives, Settings
│   ├── public/sw.js         service worker: displays web-push reminders
│   ├── e2e/                 Playwright: full keyboard-driven daily loop
│   └── scripts/shoot.mjs    headless screenshots for visual checks
├── docs/                    methodology, architecture, roadmap
├── scripts/smoke-image.sh   boots a built image and checks API, SPA, caching, DB writes
├── .github/                 CI/CD workflow (test → build → smoke → publish to GHCR), Dependabot
├── Dockerfile               single image: Vite build stage + Python runtime serving both
└── docker-compose.yml       one service, published image (or `build: .`), SQLite volume
```

## Deployment

One image, one process. The Dockerfile builds the frontend in a Node stage (on the build
platform, since the output is architecture-independent) and copies `dist/` into the Python
image. `TOBOX_STATIC_DIR` makes `create_app` register a catch-all route *after* the API
routers (`main.py: mount_spa`): real files are served (`assets/*` with immutable caching,
everything else `no-cache`), unknown `/api/*` paths stay JSON 404s, and other paths fall back to
`index.html` for client-side routing. In dev the variable is unset and Vite serves the UI.
The container runs `alembic upgrade head` on start, so upgrading is just pulling a new tag.
`TOBOX_VERSION` (set from the git ref at build time) is reported by `/api/health`.

CI (`.github/workflows/ci.yml`) gates publishing on every test job, then smoke-tests the
amd64 image with the same script as `make image` before pushing multi-arch to
`ghcr.io/<owner>/tobox`. Actions are pinned by commit SHA (Dependabot bumps them).

## Data model

- **Initiative**: title, description, `quadrant` (1–4), `status` (active/paused/done/archived).
- **Day**: keyed by local calendar `date`. Holds the morning `intention`, `planned_at`,
  the evening `reflection`, `rating` (1–5), and `reviewed_at`. A Day row is created lazily on first write;
  `GET /api/days/{date}` works for any date.
- **PlannedItem**: a ranked item for a date (max 6). `is_highlight` is always the first rank.
  Snapshots `quadrant` from its initiative. `carried_from_id` links carry-forwards.
- **LogEntry**: work actually done on a date: minutes, title, initiative, optional planned item.
  Snapshots `quadrant`.

Deleting an initiative cascades to its items and logs (the UI steers you to *archive* instead).

## Preferences

One JSON document (`app_state` row `preferences`) validated by the `Preferences` Pydantic model:
theme, timezone, reminder times/days, and per-channel settings. `GET/PUT /api/preferences`
reads and replaces it whole; the frontend saves optimistically (`useSavePreferences`). Adding a
setting is a schema change only: add a defaulted field and run `make api-types`. Old documents
load because every field has a default. The timezone is set from the browser the first time the
app loads (`PreferencesSync`), so reminders fire at local times.

## Notifications

```
scheduler (every 30s) → events (is it relevant?) → dispatch → each enabled channel
```

- `notify/events.py`: pure rules turning a `DayOut` into an optional `Notification`
  (plan reminder if nothing is planned, Highlight nudge if no time is on it, review reminder if
  work is logged but unreviewed). Unit-testable without the clock or a network.
- `notify/scheduler.py`: decides which reminders are due (configured time, up to 2h late, on an
  enabled weekday), records each (kind, date) once in `notification_log` so restarts never
  double-send, and settles irrelevant ones as skipped. Disabled with `TOBOX_SCHEDULER_ENABLED=false`.
- `notify/channels.py`: the `Channel` protocol (`enabled`, `ready`, `send`) and the `CHANNELS`
  registry. One failing channel never blocks the others. **To add a channel** (e.g. email):
  implement the protocol, register it, add its settings to `ChannelPrefs`, and add a row on the
  Settings page. Everything else (test button, log, readiness) is generic.
- Web push: the server generates and stores a VAPID key pair; each browser subscribes from
  Settings (`lib/push.ts`, `public/sw.js`). Expired subscriptions (404/410) are pruned.
  Browsers allow push only on HTTPS or localhost.

## AI agents (MCP)

`/mcp` is a Model Context Protocol server (streamable HTTP, stateless) so assistants can read
and edit the day: tools for days, plan items, logs, initiatives, and metrics, plus
`end_of_day_review` and `morning_plan` prompts. The review prompt tells the agent to pull in
activity from its *other* tools (Glean, calendar, git…) and propose log entries, asking before it writes.
Tools call the same `ops.py` functions as the REST API, so rules are identical.

Access uses OAuth 2.1 with Tobox as its own authorization server (`agents/oauth.py`): dynamic
client registration, PKCE, a consent page at `/oauth/consent` (read, or read & write scopes),
1h access tokens and rotating 30-day refresh tokens, all stored hashed, with tokens bound to the
`/mcp` resource (RFC 8707). Approving asks for `TOBOX_OWNER_PASSWORD` unless the browser is
signed in (see below). The consent form carries a per-render token that must match a
SameSite=Strict cookie, and cross-site `Sec-Fetch-Site` posts are refused, so another site can't
submit an approval through the owner's browser. `TOBOX_PUBLIC_URL` must be the URL agents use (it
is the OAuth issuer and resource). Settings lists connected agents; disconnecting one revokes its
tokens.

## Access control

`auth.py` holds the trust model, applied the same way to the REST API and the consent page:

- **No `TOBOX_OWNER_PASSWORD`**: anyone who can reach Tobox is the owner. Fine on localhost, or
  behind a reverse proxy that authenticates (e.g. SSO). There is no IP-based exception: behind
  Docker or a proxy, the client address says nothing about who is asking.
- **Password set**: every `/api` route except `/api/health` and `/api/session` needs a signed-in
  browser. `POST /api/session` checks the password and sets an HMAC-signed, HttpOnly,
  SameSite=Lax cookie (30 days, renewed on each visit; the key lives in `app_state`, and the
  signature covers the password's digest, so changing the password signs everyone out). The SPA
  shows a sign-in screen (`components/SignIn.tsx`) while `GET /api/session` says it's needed,
  and re-checks after any 401.
- **Password guesses** (sign-in and consent) go through one `PasswordGuard`: attempts are
  serialized with a 1 s delay per failure, and 10 failures in 15 minutes lock both out until the
  oldest ages out.
- **`RequestGuard` middleware**, in both modes: requests whose `Host` isn't `TOBOX_PUBLIC_URL`'s,
  localhost, or in `TOBOX_ALLOWED_HOSTS` get a 400 (DNS rebinding), and `/api` writes without
  `X-Requested-With: tobox` get a 403 (CSRF; the typed client always sends it, and a custom header
  can't be sent cross-site without a CORS preflight).

## API contract

The backend's Pydantic schemas are the source of truth. `make api-types` writes
`frontend/openapi.json` and regenerates `frontend/src/api/schema.d.ts` via `openapi-typescript`;
`make api-check` (run in CI) fails if they are stale. The frontend uses `openapi-fetch`, so
paths, params, and bodies are type-checked end to end.

Every day-scoped mutation (items, logs, carry-forward, day update) **returns the full updated
`DayOut`**, including the computed `summary`. The frontend writes it straight into the query
cache (`useDayMutation`), so there's no refetch round-trip and no client-side metric logic to
drift from the server.

## Frontend conventions

- **Days are ISO `YYYY-MM-DD` strings in local time.** Use `lib/dates.ts`; never `toISOString()`
  for a date (it's UTC).
- **Selected day lives in the URL** (`?d=`), shared by Plan/Track/Review; omitted for today.
- **Keyboard shortcuts** go through `useHotkeys` (`lib/hotkeys.tsx`). Bindings registered later
  win, so page bindings override global ones. Handlers and `enabled` are read live through a ref,
  so a binding works right after the render that enables it. Shortcuts automatically appear
  in the `?` overlay and the ⌘K palette. List pages use `useListNav` for j/k selection plus
  per-item actions.
- **Modals** use native `<dialog>` (`components/Modal.tsx`). Its `close` event is async; the
  Modal guards against stale close events, and it moves focus to the first field because
  `showModal()` otherwise focuses the Esc button.
- **Don't sync props into state with `useEffect`** (lint enforces it). Remount with a `key`, or
  mount editors only while editing (`InlineTextEdit`, `LogEditor`).
- **Theme tokens.** Components use semantic colour utilities defined in `index.css`
  (`bg-canvas`/`surface`/`raised`/`field`/`subtle`/`sunken`, `text-ink`…`ink-4`,
  `border-line-soft`/`line`/`line-strong`, `accent`, `success`/`warning`/`danger` each with
  `-solid`/`-soft`/`-line`/`-ink`) and the `card`, `field`, `btn-*` primitives, never raw
  palette colours like `bg-slate-100` or `dark:` variants. Light and dark are two blocks of
  CSS variables keyed on `<html data-theme>`, so re-theming means editing those values only.
  `lib/theme.ts` resolves the preference (system/light/dark, following the OS for system), and
  an inline script in `index.html` applies the last choice before first paint.
- **Quadrant colours** come only from `lib/quadrants.ts`. The palette is validated for colour-
  vision deficiency (Q2 is teal, not green, so it can't be confused with Q1 red). Never
  hand-pick new quadrant colours.

## Decisions

| Decision | Why |
|---|---|
| One image, FastAPI serves the SPA | One thing to publish, pull, and run; no nginx config to keep in sync. Gzip comes from Starlette. |
| SQLite + single container volume | Single-user app; zero-ops; trivially backed up. Swap `TOBOX_DATABASE_URL` for Postgres if needed. |
| Sync SQLAlchemy | Workload is tiny; sync code is simpler to read and test. |
| Server-computed metrics in every Day response | One implementation of the rules, tested in Python. |
| Generated TS types from OpenAPI | Agents and humans can't silently break the contract. |
| One owner password, no accounts | Single-user tool. Unset, it trusts the network or an authenticating proxy; set, it's a sign-in. |
| Built-in OAuth server for MCP only | Agents need delegated, revocable, scoped tokens; MCP clients expect OAuth discovery. Doesn't depend on an external identity provider. |
| Channels behind a protocol + registry | Adding email/Slack is one class and one settings field; dispatch, tests, and UI stay generic. |
| Reminders only when relevant | A nudge with nothing to act on trains you to ignore them. |
| Rank #1 ≡ Highlight | Ivy Lee's "do the first thing first" and the Daily Highlight are the same idea; one concept is easier. |
| `uv` `exclude-newer = "7 days"` | Supply-chain cooldown, matching the owner's global policy, so Docker/CI resolve identically. |
