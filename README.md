# Tobox

**Did you work on the most important thing today?**

Tobox is a daily tracker built on Covey's Important/Urgent matrix from *The 7 Habits of Highly
Effective People*. Sort your initiatives into quadrants. Each morning, pick up to six things,
most important first. Log what you actually do during the day. Each evening, see whether you
did the thing that mattered, and over weeks, whether urgency is crowding out importance.

| Ritual | Page | What happens |
|---|---|---|
| Once in a while | **Initiatives** | Place everything competing for your time on the Q1–Q4 matrix |
| Morning | **Plan** | ≤ 6 ranked items; #1 is your **Highlight**. Nudges if no Q2 work is planned |
| During the day | **Track** | Quick-log work: `drafted intro #book 45m` |
| Evening | **Review** | Verdict on the Highlight, planned vs. actual by quadrant, rating, reflection, carry-forward |
| Any time | **History** | Hit rate, streaks, Q2 share, plan adherence, verdict calendar, trends |

The reasoning behind this design (Covey + Ivy Lee + Daily Highlight + shutdown ritual) is in
[docs/methodology.md](docs/methodology.md).

## Run it

The app is one Docker image (API + web UI), published to GitHub Container Registry by CI.
Copy [docker-compose.yml](docker-compose.yml) anywhere and run:

```bash
docker compose up -d             # → http://localhost:8080
docker compose pull && docker compose up -d     # upgrade
```

`TOBOX_TAG` picks a release (default `latest`; `main` tracks the main branch) and `TOBOX_PORT`
the host port. Without compose: `docker run -d -p 8080:8000 -v tobox-data:/data ghcr.io/chriscla/tobox`.
From a checkout, `make up` builds the image from source instead.

Data lives in the `tobox-data` Docker volume (SQLite). Back it up with
`docker compose cp tobox:/data/tobox.db ./tobox-backup.db`. `GET /api/health` reports the running version.

## CI/CD

[GitHub Actions](.github/workflows/ci.yml) runs on every push and pull request: workflow lint,
backend (ruff, mypy, pytest), frontend (API-contract check, oxlint, prettier, tsc, Vitest),
Playwright e2e, then builds the image and smoke-tests it (`scripts/smoke-image.sh`, also
`make image` locally). Once everything passes, the image is published for amd64 and arm64:

| Trigger | Tags |
|---|---|
| Push to `main` | `main`, `sha-<short>` |
| Tag `v1.2.3` | `1.2.3`, `1.2`, `1`, `latest` (`v0.x` skips the bare major tag) |
| Pull request | built and tested, not published |

Release: `git tag v0.2.0 && git push origin v0.2.0`. Dependabot proposes weekly grouped
updates (actions, uv, npm, base images) after a 7-day cooldown.

## Develop

Requires [uv](https://docs.astral.sh/uv/), Node 22+, and Docker (for the stack).

```bash
make setup     # deps + Playwright browser + git hooks
make seed      # optional: 60 days of demo data
make dev       # API on :8000, web on :5173
make check     # lint, typecheck, tests
make e2e       # end-to-end keyboard flow
make help      # everything else
```

Stack: FastAPI · SQLAlchemy 2 · Alembic · SQLite | React 19 · TypeScript · Vite · Tailwind v4 ·
TanStack Query · types generated from OpenAPI | pytest · Vitest · Playwright | Docker · GitHub Actions · GHCR.
See [docs/architecture.md](docs/architecture.md). Working with an AI agent? See [CLAUDE.md](CLAUDE.md).

## Keyboard shortcuts

Press `?` anywhere for the live list, or `Ctrl/⌘ K` for the command palette.

| Global | | Lists (j/k to select) | |
|---|---|---|---|
| `g p` `g t` `g r` `g h` `g i` | Plan / Track / Review / History / Initiatives | `j` `k` | Next / previous |
| `[` `]` `.` | Previous day / next day / today | `e` / `Enter` | Edit |
| `l` | Log work (from anywhere) | `d` / `Backspace` | Delete / remove |
| `⌘/Ctrl K` | Command palette | `x` | Toggle done |
| `?` | Shortcut help | `Esc` | Cancel / clear |

| Plan | | Track | | Review | |
|---|---|---|---|---|---|
| `a` | Add item | `Enter` in log | Log | `1`–`5` | Rate the day |
| `s` | Make highlight | `⌘/Ctrl Enter` in log | Log & complete | `r` | Write reflection |
| `⇧J` `⇧K` | Move down / up | `#…` in log | Pick target | `c` | Carry unfinished forward |
| `=` `-` | Estimate ±15m | `⇧H` | Log time on Highlight | `⌘/Ctrl Enter` | Complete review |
| `⌘/Ctrl Enter` | Commit plan | | | | |

Initiatives: `n` new, `1`–`4` move to quadrant, `p` pause, `x` done, `a` archive, `v` show inactive.
History: `w` `m` `q` `y` for 7 / 30 / 90 / 365 days.
