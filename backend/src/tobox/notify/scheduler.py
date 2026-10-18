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


def due_kinds(prefs: Preferences, now: datetime, handled: set[str]) -> list[EventKind]:
    """Reminders whose time window contains `now` (local) and weren't handled today."""
    n = prefs.notifications
    if now.weekday() not in n.days:
        return []
    due: list[EventKind] = []
    for kind in RULES:
        pref = getattr(n, kind)
        if not pref.enabled or kind in handled:
            continue
        hh, mm = map(int, pref.time.split(":"))
        start = datetime.combine(now.date(), time(hh, mm), now.tzinfo)
        if start <= now < start + WINDOW:
            due.append(kind)
    return due


def _handled_today(session: Session, day: date) -> set[str]:
    return set(session.scalars(select(NotificationLog.kind).where(NotificationLog.date == day)))


def tick(session: Session, now: datetime | None = None) -> list[str]:
    """Evaluate due reminders once. Returns the kinds that were sent."""
    prefs = prefs_store.load(session)
    now = now or prefs_store.local_now(prefs)
    today = now.date()
    sent: list[str] = []
    for kind in due_kinds(prefs, now, _handled_today(session, today)):
        note = RULES[kind](services.build_day(session, today))
        if note is None:
            # Nothing to nudge about (e.g. already planned): settle it for today.
            session.add(
                NotificationLog(
                    kind=kind, date=today, channel="-", ok=True, detail="skipped: nothing to do"
                )
            )
            session.commit()
            continue
        dispatch(session, prefs, note, today)
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
