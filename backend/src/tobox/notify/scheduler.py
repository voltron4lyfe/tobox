"""Time-based reminders. `due_kinds` is pure; `tick` evaluates and sends; `run` loops forever."""

import asyncio
import logging
from collections.abc import Callable
from datetime import date, datetime, time, timedelta

import anyio
from sqlalchemy import select
from sqlalchemy.orm import Session

from tobox import prefs as prefs_store
from tobox import services
from tobox.models import NotificationLog
from tobox.notify.dispatch import dispatch
from tobox.notify.events import RULES
from tobox.schemas import EventKind, Preferences

log = logging.getLogger(__name__)

# A reminder fires at its time or up to this long after (covers restarts and sleep), never
# hours late: turning a reminder on at 3pm must not send a stale 8:30am "plan your day".
WINDOW = timedelta(hours=2)
INTERVAL_SECONDS = 30


def due_kinds(
    prefs: Preferences, now: datetime, handled: Callable[[date], set[str]]
) -> list[tuple[EventKind, date]]:
    """Reminders whose time window contains `now` (local) and weren't handled for their day.

    Each comes with the day it is about. A window that opened late yesterday (a 23:30 review
    reminder) can still be open after midnight; it then reminds about yesterday.
    """
    n = prefs.notifications
    due: list[tuple[EventKind, date]] = []
    for kind in RULES:
        pref = getattr(n, kind)
        if not pref.enabled:
            continue
        hh, mm = map(int, pref.time.split(":"))
        for day in (now.date(), now.date() - timedelta(days=1)):
            start = datetime.combine(day, time(hh, mm), now.tzinfo)
            if (
                day.weekday() in n.days
                and start <= now < start + WINDOW
                and kind not in handled(day)
            ):
                due.append((kind, day))
    return due


def _handled(session: Session, day: date) -> set[str]:
    return set(session.scalars(select(NotificationLog.kind).where(NotificationLog.date == day)))


def tick(session: Session, now: datetime | None = None) -> list[str]:
    """Evaluate due reminders once. Returns the kinds that were sent."""
    prefs = prefs_store.load(session)
    now = now or prefs_store.local_now(prefs)
    sent: list[str] = []
    for kind, day in due_kinds(prefs, now, lambda d: _handled(session, d)):
        note = RULES[kind](services.build_day(session, day))
        if note is None:
            # Nothing to nudge about (e.g. already planned): settle it for that day.
            session.add(
                NotificationLog(
                    kind=kind, date=day, channel="-", ok=True, detail="skipped: nothing to do"
                )
            )
            session.commit()
            continue
        dispatch(session, prefs, note, day)
        sent.append(kind)
    return sent


async def run(session_factory: Callable[[], Session]) -> None:
    def once() -> None:
        with session_factory() as session:
            tick(session)

    while True:
        try:
            await anyio.to_thread.run_sync(once)
        except Exception:
            log.exception("reminder tick failed")
        await asyncio.sleep(INTERVAL_SECONDS)
