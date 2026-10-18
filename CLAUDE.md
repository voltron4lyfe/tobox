# Tobox: agent guide

A daily Important/Urgent tracker: plan in the morning (≤ 6 ranked items, #1 = Highlight),
log work during the day, review in the evening, see trends over time. Read
[docs/methodology.md](docs/methodology.md) for the product rules and metric definitions and
[docs/architecture.md](docs/architecture.md) for structure and conventions before non-trivial work.

## Commands (always via make)

```bash
make setup        # install everything (uv sync, npm ci, playwright chromium, git hooks)
make dev          # API :8000 + Vite :5173 (proxies /api), both with reload
make seed         # ~60 days of demo data into an empty dev DB (backend/data/tobox.db)
make check        # lint + typecheck + unit/integration tests — must pass before every commit
make e2e          # Playwright daily-loop test against isolated servers (ports 8001/5174)
make api-types    # regenerate frontend types after changing backend schemas
make migration m="describe change"   # after changing models.py
make shoot p="/plan /history" f="--mobile --dark"   # screenshots → frontend/screenshots/
make up           # production stack via docker compose on :8080
```

Single test: `cd backend && uv run pytest tests/test_api.py -k carry` ·
`cd frontend && npx vitest run src/lib/quicklog.test.ts`.

## Workflow

1. **Understand the rule first.** Product behaviour is specified in `docs/methodology.md`; if you
   change behaviour, update that doc in the same change.
2. **Test first where it's cheap.** Metric/rule changes → `backend/tests/test_metrics.py`
   (pure functions). Endpoint changes → `backend/tests/test_api.py`. Parsing/date logic →
   colocated `*.test.ts`. User-visible flows → extend `frontend/e2e/daily-loop.spec.ts`.
3. **Schema changes ripple in a fixed order:** `models.py` → `make migration m=…` (review the
   generated file) → `schemas.py` → `make api-types` → frontend. `test_migrations.py` fails if
   models and migrations drift; `make api-check` fails if generated types are stale.
4. **UI changes: look at them.** Run `make dev` (or reuse running servers), then `make shoot`
   for desktop, `f=--mobile`, and `f=--dark`, and read the PNGs. Check 375px width: no
   horizontal scroll, tap targets ≥ 32px.
5. **Every new action gets a shortcut.** Register it with `useHotkeys` (or `useListNav` actions)
   with a clear `description` and `group`; it then shows up in `?` and ⌘K automatically.
   Show a `<Kbd>` hint on the corresponding button. Don't hijack keys while typing; only
   `mod+…`/`escape` bindings should set `allowInInput`.
6. `make check` green → commit with a focused message. Run `make e2e` for UI-flow changes.

## Conventions and gotchas

- Backend: typed (`mypy --strict`), ruff-formatted, 100 cols. Routers stay thin; logic lives in
  `metrics.py` (pure) or `services.py`. Day-scoped mutations return the full `DayOut`.
- Frontend: TS strict + `noUncheckedIndexedAccess`; oxlint + prettier (no semicolons,
  single quotes, 100 cols). Server data only through hooks in `src/api/hooks.ts`.
- Days are local `YYYY-MM-DD` strings: use `lib/dates.ts`, never `Date#toISOString()` for days.
- Quadrant colours/names only from `lib/quadrants.ts` (CVD-validated palette).
- No `useEffect` to copy props into state (lint error). Remount with `key` or mount-on-edit.
- `<dialog>` close events are async and `showModal()` steals focus. Always use `components/Modal`.
- Hotkeys pressed during a loading state hit no element: prefer intents that wait for mount
  (see `lib/events.ts` focus-log pattern) over `setTimeout`.
- `uv` has `exclude-newer = "7 days"`: brand-new package versions won't resolve; that's on purpose.
- In zsh, unmatched globs error (`rm data/*.db*`); use explicit paths.

## Definition of done

`make check` passes · new behaviour has tests · docs updated if rules/structure changed ·
UI changes screenshotted at desktop + mobile · new actions have shortcuts.
