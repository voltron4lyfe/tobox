# Roadmap

## v1 (done)

- Initiatives on the Covey matrix, with keyboard triage (1–4 to move, p/x/a for status).
- Morning plan: ≤ 6 ranked items, #1 = Highlight, plan-check nudges, carry-over from yesterday.
- Tracking: quick-entry log (`text #target 45m`), plan checklist, live planned-vs-actual.
- Evening review: verdict, planned vs. actual per quadrant, unplanned work, rating, reflection,
  carry-forward.
- History: hit rate, streaks, Q2 share, adherence, verdict calendar, time-by-quadrant chart,
  intended-vs-actual mix, initiative and day tables.
- Keyboard-first throughout (`?` overlay, ⌘K palette, g-chords), responsive mobile/desktop,
  dark mode, single-image Docker deployment published to GHCR by GitHub Actions CI/CD.

## v1.1 (done)

- Preferences page; light / dark / system theme built on semantic design tokens.
- Reminders (plan, Highlight nudge, review) via pluggable channels: browser push and Discord.
- MCP server with OAuth 2.1 so AI agents can read, plan, log, and review.

## v1.2 (done)

- Owner sign-in, consent CSRF protection, Host/CSRF request guard.
- **Roles** (Covey): optional role per initiative, role filter, balance across roles in History.
- **Routines**: recurring items on chosen weekdays (every N weeks), offered on the plan when
  due, with adherence ("routines kept") in History. Available to agents over MCP.

## Next candidates

Roughly in priority order:

1. **Weekly Big Rocks**: a weekly plan of 3–5 Q2 rocks per role that daily planning pulls from,
   plus a weekly review comparing rocks with days.
2. **Calendar feed import**: subscribe to an iCal/ICS URL (e.g. Google Calendar's secret
   address) and offer today's events alongside due routines, mapped to initiatives by rule.
3. **Focus timer**: start/stop on a planned item to log minutes automatically.
4. **PWA**: installable and offline-tolerant, with queued writes.
5. **More notification channels**: email (SMTP), Slack, ntfy.
6. **Export/backup**: JSON/CSV export and import.
7. **Multi-user**: separate accounts, if it ever needs more than one owner.
8. **Drag-and-drop reordering** on touch devices (today: star / arrows / keyboard).
