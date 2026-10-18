"""Events: pure rules deciding whether a reminder is worth sending, given the day's state."""

from collections.abc import Callable
from dataclasses import dataclass

from tobox.schemas import DayOut, EventKind


@dataclass(frozen=True)
class Notification:
    kind: str
    title: str
    body: str
    # App-relative path opened when the notification is clicked.
    path: str = "/"


def plan_reminder(day: DayOut) -> Notification | None:
    if day.planned_at is not None or day.items:
        return None
    return Notification(
        kind="plan_reminder",
        title="Plan your day",
        body="Pick up to six things and choose today's Highlight before the day picks for you.",
        path="/plan",
    )


def highlight_nudge(day: DayOut) -> Notification | None:
    highlight = next((i for i in day.items if i.is_highlight), None)
    if highlight is None or highlight.done or highlight.logged_minutes > 0:
        return None
    return Notification(
        kind="highlight_nudge",
        title="Your Highlight is waiting",
        body=f"No time on “{highlight.title}” yet. Is it still the most important thing today?",
        path="/today",
    )


def review_reminder(day: DayOut) -> Notification | None:
    if day.reviewed_at is not None or not (day.items or day.logs):
        return None
    hl = next((i for i in day.items if i.is_highlight), None)
    body = (
        f"Did “{hl.title}” happen? Close the day and carry anything unfinished."
        if hl
        else "Close the day: what did you actually work on?"
    )
    return Notification(kind="review_reminder", title="Review your day", body=body, path="/review")


RULES: dict[EventKind, Callable[[DayOut], Notification | None]] = {
    "plan_reminder": plan_reminder,
    "highlight_nudge": highlight_nudge,
    "review_reminder": review_reminder,
}


def sample_notification() -> Notification:
    return Notification(
        kind="test",
        title="Tobox notifications work",
        body="You'll get reminders here for planning, your Highlight, and the evening review.",
        path="/settings",
    )
