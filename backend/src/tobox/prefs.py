"""User preferences, stored as one validated JSON document in `app_state`."""

from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session

from tobox.errors import InvalidError
from tobox.models import AppState
from tobox.schemas import Preferences

KEY = "preferences"


def load(session: Session) -> Preferences:
    row = session.get(AppState, KEY)
    # Unknown/removed fields are ignored and new ones take defaults, so the stored document
    # survives schema evolution without migrations.
    return Preferences.model_validate_json(row.value) if row else Preferences()


def save(session: Session, prefs: Preferences) -> Preferences:
    if prefs.timezone is not None:
        try:
            ZoneInfo(prefs.timezone)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise InvalidError(f"unknown timezone: {prefs.timezone}") from exc
    row = session.get(AppState, KEY)
    if row is None:
        session.add(AppState(key=KEY, value=prefs.model_dump_json()))
    else:
        row.value = prefs.model_dump_json()
    session.commit()
    return prefs


def zone(prefs: Preferences) -> ZoneInfo:
    return ZoneInfo(prefs.timezone or "UTC")


def local_now(prefs: Preferences) -> datetime:
    return datetime.now(zone(prefs))


def local_today(session: Session) -> date:
    return local_now(load(session)).date()
