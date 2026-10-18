# Architecture

```
tobox/
├── backend/                 FastAPI + SQLAlchemy 2 + Alembic, managed by uv
│   ├── src/tobox/
│   │   ├── main.py          app factory; all routes under /api
│   │   ├── models.py        ORM models (Initiative, Day, PlannedItem, LogEntry)
│   │   ├── schemas.py       Pydantic request/response models = the HTTP contract
│   │   ├── metrics.py       pure metric functions (no DB/HTTP)
│   │   ├── services.py      assembles a Day response from rows
│   │   ├── api/             routers: initiatives, days (+items, logs), metrics
│   │   ├── seed.py          demo data (make seed)
│   │   └── openapi.py       prints the OpenAPI schema (make api-types)
│   ├── migrations/          Alembic (render_as_batch for SQLite)
│   └── tests/               pytest: metrics unit tests, API tests, migration drift check
├── frontend/                React 19 + TypeScript + Vite + Tailwind v4
│   ├── openapi.json         generated from the backend; committed
│   ├── src/api/             schema.d.ts (generated), typed client, TanStack Query hooks
│   ├── src/lib/             pure helpers (dates, durations, quick-log parser, keys) + hooks
│   ├── src/components/      UI building blocks (AppShell, Modal, LogComposer, charts, …)
│   ├── src/pages/           Plan, Today (Track), Review, History, Initiatives
│   ├── e2e/                 Playwright: full keyboard-driven daily loop
│   └── scripts/shoot.mjs    headless screenshots for visual checks
├── docs/                    methodology, architecture, roadmap
└── docker-compose.yml       api (uvicorn, SQLite volume) + web (nginx, proxies /api)
```

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
- **Quadrant colours** come only from `lib/quadrants.ts`. The palette is validated for colour-
  vision deficiency (Q2 is teal, not green, so it can't be confused with Q1 red). Never
  hand-pick new quadrant colours.

## Decisions

| Decision | Why |
|---|---|
| SQLite + single container volume | Single-user app; zero-ops; trivially backed up. Swap `TOBOX_DATABASE_URL` for Postgres if needed. |
| Sync SQLAlchemy | Workload is tiny; sync code is simpler to read and test. |
| Server-computed metrics in every Day response | One implementation of the rules, tested in Python. |
| Generated TS types from OpenAPI | Agents and humans can't silently break the contract. |
| No auth in v1 | Personal tool run on your own machine/network. Put it behind a reverse proxy with auth if exposed. |
| Rank #1 ≡ Highlight | Ivy Lee's "do the first thing first" and the Daily Highlight are the same idea; one concept is easier. |
| `uv` `exclude-newer = "7 days"` | Supply-chain cooldown, matching the owner's global policy, so Docker/CI resolve identically. |
