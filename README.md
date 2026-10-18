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

```bash
docker compose up -d --build     # → http://localhost:8080  (TOBOX_PORT=9000 to change)
```

Data lives in the `tobox-data` Docker volume (SQLite). Back it up with
`docker compose cp api:/data/tobox.db ./tobox-backup.db`.

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
TanStack Query · types generated from OpenAPI | pytest · Vitest · Playwright | Docker + nginx.
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
