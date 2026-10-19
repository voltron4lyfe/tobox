# Methodology: why Tobox works the way it does

Tobox answers one question every day: **did I work on the most important thing?**
This document records the task-management paradigms we evaluated, what we took from each,
and exactly how the metrics are defined.

## Paradigms evaluated

| Paradigm | Core idea | Strength | Weakness for this goal |
|---|---|---|---|
| **Covey's Time Management Matrix** (*7 Habits*, Habit 3) | Classify by Important × Urgent into Q1–Q4; effective people invest in Q2 | The right lens for "most important" vs "most pressing" | Says *what* matters, not how to run a day |
| **Big Rocks / Weekly Q2 planning** (*First Things First*) | Schedule the important "rocks" before the gravel fills the jar; 1–2 goals per role per week | Protects Q2 time proactively | Weekly cadence; heavy roles ceremony |
| **Ivy Lee Method** | Each day, list ≤ 6 tasks in priority order; work the first until done | Forces ranking; hard cap prevents overload | Doesn't help decide *what* is important |
| **Daily Highlight** (*Make Time*) / **MIT** | Choose one thing that would make the day a win | A single, unambiguous success criterion | Ignores the rest of the day |
| **1-3-5 rule** | 1 big, 3 medium, 5 small tasks | Limits ambition on chaotic days | Size-based, not importance-based |
| **Time blocking** | Assign tasks to calendar slots | Great for predictable schedules | Brittle for reactive roles; duplicates a calendar |
| **GTD** | Capture everything; contexts; next actions; weekly review | Comprehensive capture | Optimises throughput, not importance; heavy |
| **Kanban / WIP limits** | Visualise flow; limit work in progress | Exposes bottlenecks | Flow-oriented, no notion of importance |
| **Daily planning + shutdown ritual** (Sunsama-style) | Morning plan with workload estimate; evening review that rolls work forward | Bookends the day; makes planned vs. actual visible | Tools rarely *snapshot* the plan, so the comparison is lost |

## What we chose: the "Compass" synthesis

Tobox combines the pieces that reinforce each other:

1. **Initiatives on Covey's matrix (the map).** Everything competing for your time is an
   initiative placed in Q1–Q4. Q2 is visually emphasised and listed first when planning, because
   it is the quadrant the morning rush neglects.
2. **Ivy Lee ranked plan with a Highlight (the morning ritual).** Each day gets up to **six**
   planned items, ranked. **Rank #1 is the Highlight**: the one thing that would make the day a
   win. Moving an item to the top makes it the Highlight; there is no separate concept to manage.
   The plan check nudges you when no Q2 work is planned, the Highlight is Q3/Q4, or estimates
   exceed 8h.
3. **Lightweight logging (during the day).** Record what you actually worked on, against a
   planned item or any initiative, with a single quick-entry line (`drafted intro #book 45m`).
   Logs snapshot the initiative's quadrant so history stays honest if you re-classify later.
4. **Shutdown review (the evening ritual).** A verdict on the Highlight, planned vs. actual per
   quadrant, unplanned work, a 1–5 rating, a reflection, and one-key carry-forward of unfinished
   items. Carrying never duplicates a task: an item already on the target day, directly or via
   earlier carries (Mon → Tue → Wed), is skipped.
5. **History (the feedback loop).** Hit rate, streaks, Q2 share, plan adherence, a verdict
   calendar, and an intended-vs-actual quadrant mix. These show over weeks whether urgency is
   crowding out importance.

6. **Gentle reminders (optional).** At times you choose: plan your day (only if nothing is
   planned), a Highlight nudge in the afternoon (only if no time is logged on it), and the
   evening review (only if you logged work and haven't reviewed). A reminder is skipped when it
   has nothing to ask, and a late one (over 2h) is dropped instead of sent stale. The 2h window
   can run past midnight (a 23:30 review reminder still goes out at 00:10, about the day before).
   Delivered by browser notification and/or Discord.
7. **Review with your AI agent (optional).** An assistant connected over MCP can read the day,
   gather what you did from its other tools (search, calendar, code), and propose log entries
   and a reflection. You confirm before it writes. The same rules apply as in the UI.

We deliberately left out (for v1) GTD-style inboxes, time blocking, and timers: they add
ceremony without improving the answer to the core question. See [roadmap](roadmap.md).

## Metric definitions

All metrics are computed server-side in `backend/src/tobox/metrics.py` (pure functions, unit
tested). Minutes come from log entries; planned minutes come from item estimates.

### Per day

| Metric | Definition |
|---|---|
| **Verdict** | `done`: Highlight marked done · `worked`: time logged against the Highlight item · `missed`: Highlight exists but got no time · `unplanned`: work logged with no plan · `idle`: nothing planned or logged |
| **Q2 share** | Q2 minutes ÷ total logged minutes |
| **Important share** | (Q1 + Q2) minutes ÷ total logged minutes |
| **Plan adherence ("on plan")** | Minutes logged against planned items *or initiatives that appear in the plan* ÷ total logged minutes |
| **Unplanned minutes** | Total logged − on-plan minutes |
| **Items done** | Planned items marked done ÷ planned items |

### Over a range

| Metric | Definition |
|---|---|
| **Days tracked** | Days whose verdict is not `idle` |
| **Highlight hit rate** | Days with verdict `done` or `worked` ÷ days that had a Highlight |
| **Current / longest streak** | Consecutive hit days. `idle` days (e.g. untracked weekends) neither extend nor break a streak. Only the final day of the range (normally today) gets grace: if it isn’t a hit yet, it’s treated as in progress. An earlier miss always breaks the current streak |
| **Avg. plan adherence** | Mean of daily adherence over days with logged time |
| **Plan accuracy** | Logged ÷ planned minutes, over days that had a plan |
| **Intended vs. actual** | Quadrant mix of planned estimates vs. logged minutes |

## Sources

- Covey, *The 7 Habits of Highly Effective People* (Habit 3) and *First Things First*
- [Quadrant 2 time management process](https://www.shortform.com/blog/quadrant-2-time-management/)
- [Big rocks](https://weekplan.net/academy/glossary/big-rocks/)
- [Ivy Lee method (James Clear)](https://jamesclear.com/ivy-lee)
- [Daily planning methods compared](https://goalsandprogress.com/daily-planning-methods-that-work/)
- [Sunsama daily planning](https://help.sunsama.com/docs/daily-planning) and its
  [planned-vs-actual gap](https://roadmap.sunsama.com/improvements/p/make-completed-tasks-on-the-calendar-reflect-actual-time-rather-than-planned-tim)
