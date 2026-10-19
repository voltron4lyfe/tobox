"""Populate the database with realistic demo data: `uv run python -m tobox.seed`.

Refuses to run against a database that already has initiatives unless --force is given.
"""

import argparse
import random
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import func, select

from tobox.db import SessionLocal
from tobox.models import Day, Initiative, LogEntry, PlannedItem, Role, Routine
from tobox.recurrence import is_due

ROLES = ["Professional", "Parent", "Health", "Author"]

INITIATIVES = [
    ("Ship v2 onboarding", 1, "Launch is on the 30th.", "Professional"),
    ("Quarterly planning", 2, "Set direction for next quarter.", "Professional"),
    ("Write the book", 2, "One chapter a month.", "Author"),
    ("Strength training", 2, "3x a week.", "Health"),
    ("Mentor the team", 2, "Weekly 1:1s and growth plans.", "Professional"),
    ("Customer escalations", 1, "", "Professional"),
    ("Kids' soccer", 1, "Practice Tue/Thu, games on Saturday.", "Parent"),
    ("Time with the kids", 2, "Unhurried, phones away.", "Parent"),
    ("Inbox & Slack", 3, "", None),
    ("Ad-hoc meetings", 3, "", "Professional"),
    ("Social media", 4, "", None),
]

# (initiative, title, weekdays, minutes)
ROUTINES = [
    ("Strength training", "Gym class", [0, 2, 4], 60),
    ("Kids' soccer", "Soccer practice drop-off", [1, 3], 45),
    ("Mentor the team", "Team 1:1s", [3], 60),
]

TASKS = {
    "Ship v2 onboarding": ["Fix signup bug", "QA checklist", "Release notes", "Review PRs"],
    "Quarterly planning": ["Draft OKRs", "Review metrics", "Roadmap doc"],
    "Write the book": ["Outline chapter", "Write 1000 words", "Edit draft"],
    "Strength training": ["Gym session", "Mobility work"],
    "Mentor the team": ["1:1 with Sam", "Career plan review", "Pairing session"],
    "Customer escalations": ["Acme outage call", "Root-cause writeup"],
    "Kids' soccer": ["Pack the kit", "Game on Saturday"],
    "Time with the kids": ["Bike ride", "Board games", "Bedtime stories"],
    "Inbox & Slack": ["Inbox zero", "Slack catch-up"],
    "Ad-hoc meetings": ["Sync with design", "Unplanned call"],
    "Social media": ["Scrolling"],
}


def seed(days: int, force: bool, rng: random.Random) -> None:
    with SessionLocal() as s:
        if s.scalar(select(func.count(Initiative.id))) and not force:
            raise SystemExit("Database already has data; pass --force to add demo data anyway.")
        roles = {name: Role(name=name, sort_order=i) for i, name in enumerate(ROLES)}
        s.add_all(roles.values())
        s.flush()
        inits = [
            Initiative(
                title=t,
                quadrant=q,
                description=d,
                sort_order=i,
                role_id=roles[r].id if r else None,
            )
            for i, (t, q, d, r) in enumerate(INITIATIVES)
        ]
        s.add_all(inits)
        s.flush()
        by_title = {i.title: i for i in inits}
        today = date.today()
        routines = [
            Routine(
                initiative_id=by_title[init].id,
                title=title,
                estimate_minutes=mins,
                weekdays=weekdays,
                start_date=today - timedelta(days=days),
            )
            for init, title, weekdays, mins in ROUTINES
        ]
        s.add_all(routines)
        s.flush()

        for offset in range(days, 0, -1):
            day = today - timedelta(days=offset)
            if day.weekday() >= 5 and rng.random() < 0.7:
                continue  # most weekends untracked
            plans = rng.random() > 0.12
            planned: list[PlannedItem] = []
            row: Day | None = None
            if plans:
                important = [i for i in inits if i.quadrant <= 2]
                picks = rng.sample(important, k=rng.randint(2, 4))
                if rng.random() < 0.2:
                    picks.append(next(i for i in inits if i.quadrant == 3))
                for rank, init in enumerate(picks):
                    planned.append(
                        PlannedItem(
                            date=day,
                            initiative_id=init.id,
                            title=rng.choice(TASKS[init.title]),
                            quadrant=init.quadrant,
                            estimate_minutes=rng.choice([30, 45, 60, 90, 120]),
                            rank=rank,
                            is_highlight=rank == 0,
                        )
                    )
                for routine in routines:
                    due = is_due(routine.weekdays, 1, routine.start_date, day)
                    if due and len(planned) < 6 and rng.random() < 0.85:
                        init = next(i for i in inits if i.id == routine.initiative_id)
                        planned.append(
                            PlannedItem(
                                date=day,
                                initiative_id=init.id,
                                title=routine.title,
                                quadrant=init.quadrant,
                                estimate_minutes=routine.estimate_minutes,
                                rank=len(planned),
                                routine_id=routine.id,
                            )
                        )
                s.add_all(planned)
                s.flush()
                row = Day(
                    date=day,
                    intention=rng.choice(["", "Focus", "Calm and deliberate", "Deep work"]),
                    reflection="",
                    planned_at=datetime.combine(day, time(8, 30), UTC),
                )
                s.add(row)

            clock = datetime.combine(day, time(9, 0), UTC)
            # Discipline improves over time: later days stick to the plan more.
            focus = 0.45 + 0.4 * (1 - offset / days)
            for item in planned:
                if rng.random() < (focus + 0.1 if item.is_highlight else focus - 0.1):
                    mins = max(15, int(item.estimate_minutes * rng.uniform(0.5, 1.4)))
                    clock += timedelta(minutes=mins)
                    s.add(
                        LogEntry(
                            date=day,
                            initiative_id=item.initiative_id,
                            planned_item_id=item.id,
                            title=item.title,
                            quadrant=item.quadrant,
                            minutes=mins,
                            created_at=clock,
                        )
                    )
                    item.done = rng.random() < 0.7
            for _ in range(rng.randint(1, 4)):
                init = rng.choice([i for i in inits if i.quadrant >= 3] + inits[5:6])
                mins = rng.choice([15, 20, 30, 45, 60])
                clock += timedelta(minutes=mins)
                s.add(
                    LogEntry(
                        date=day,
                        initiative_id=init.id,
                        title=rng.choice(TASKS[init.title]),
                        quadrant=init.quadrant,
                        minutes=mins,
                        created_at=clock,
                    )
                )
            if row is not None and rng.random() < 0.75:
                row.rating = rng.randint(2, 5)
                row.reviewed_at = clock
                row.reflection = rng.choice(
                    ["", "Meetings ate the afternoon.", "Good focus block in the morning."]
                )
        s.commit()
    print(
        f"Seeded {len(ROLES)} roles, {len(INITIATIVES)} initiatives, {len(ROUTINES)} routines "
        f"and {days} days of history."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=60)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()
    seed(args.days, args.force, random.Random(args.seed))


if __name__ == "__main__":
    main()
