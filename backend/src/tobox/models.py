"""ORM models.

Quadrants follow Covey's time-management matrix:
  1 = Important & Urgent       (crises, deadlines)
  2 = Important & Not Urgent   (planning, growth, relationships) -- the goal
  3 = Not Important & Urgent   (interruptions, some meetings)
  4 = Not Important & Not Urgent (busywork, time-wasters)

Planned items and log entries snapshot the initiative's quadrant at creation
time so history stays accurate if an initiative is later re-classified.

Roles (Covey: parent, professional, health…) group initiatives; routines are recurring items
(a weekly class, soccer practice) that daily planning suggests on the days they're due.
"""

import enum
from datetime import UTC, date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, Dialect, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from tobox.db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator[datetime]):
    """Timezone-aware datetime that always round-trips as UTC.

    SQLite drops tzinfo on storage, so naive values read back are re-tagged as UTC; without this
    the API would emit offset-less timestamps that browsers interpret as local time.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:  # noqa: ARG002
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC) if value is not None else None

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:  # noqa: ARG002
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


class Weekdays(TypeDecorator[list[int]]):
    """A set of weekdays (Python numbering, 0 = Monday) stored as "0,2,4"."""

    impl = String(20)
    cache_ok = True

    def process_bind_param(self, value: list[int] | None, dialect: Dialect) -> str | None:  # noqa: ARG002
        return ",".join(str(d) for d in sorted(set(value))) if value is not None else None

    def process_result_value(self, value: str | None, dialect: Dialect) -> list[int] | None:  # noqa: ARG002
        return [int(d) for d in value.split(",") if d] if value is not None else None


class Role(Base):
    """An area of life that initiatives serve (Covey's roles): Parent, Professional, Health…"""

    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    sort_order: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class InitiativeStatus(enum.StrEnum):
    active = "active"
    paused = "paused"
    done = "done"
    archived = "archived"


class Initiative(Base):
    __tablename__ = "initiatives"
    __table_args__ = (CheckConstraint("quadrant BETWEEN 1 AND 4", name="ck_initiative_quadrant"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    quadrant: Mapped[int]
    status: Mapped[InitiativeStatus] = mapped_column(String(16), default=InitiativeStatus.active)
    sort_order: Mapped[int] = mapped_column(default=0)
    role_id: Mapped[int | None] = mapped_column(
        ForeignKey("roles.id", ondelete="SET NULL"), default=None
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)


class Day(Base):
    """A calendar day: the morning plan's intention and the evening review."""

    __tablename__ = "days"
    __table_args__ = (
        CheckConstraint("rating IS NULL OR rating BETWEEN 1 AND 5", name="ck_day_rating"),
    )

    date: Mapped[date] = mapped_column(Date, primary_key=True)
    intention: Mapped[str] = mapped_column(Text, default="")
    planned_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), default=None)
    reflection: Mapped[str] = mapped_column(Text, default="")
    rating: Mapped[int | None] = mapped_column(default=None)
    reviewed_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), default=None)


class PlannedItem(Base):
    """A ranked item in a day's plan. Exactly one per day may be the highlight."""

    __tablename__ = "planned_items"
    __table_args__ = (CheckConstraint("quadrant BETWEEN 1 AND 4", name="ck_planned_quadrant"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    initiative_id: Mapped[int] = mapped_column(ForeignKey("initiatives.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(300))
    quadrant: Mapped[int]
    estimate_minutes: Mapped[int] = mapped_column(default=30)
    rank: Mapped[int] = mapped_column(default=0)
    is_highlight: Mapped[bool] = mapped_column(default=False)
    done: Mapped[bool] = mapped_column(default=False)
    carried_from_id: Mapped[int | None] = mapped_column(
        ForeignKey("planned_items.id", ondelete="SET NULL"), default=None
    )
    routine_id: Mapped[int | None] = mapped_column(
        ForeignKey("routines.id", ondelete="SET NULL"), default=None
    )
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    initiative: Mapped[Initiative] = relationship(lazy="joined")


class Routine(Base):
    """Something that recurs on set weekdays, every `every_weeks` weeks from `start_date`.

    It isn't planned automatically: on a due day the plan offers it, so the ranked six stay a
    choice. A planned copy keeps `routine_id`, which is how adherence is measured.
    """

    __tablename__ = "routines"
    __table_args__ = (
        CheckConstraint("every_weeks BETWEEN 1 AND 12", name="ck_routine_every_weeks"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    initiative_id: Mapped[int] = mapped_column(ForeignKey("initiatives.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(300))
    estimate_minutes: Mapped[int] = mapped_column(default=30)
    weekdays: Mapped[list[int]] = mapped_column(Weekdays())
    every_weeks: Mapped[int] = mapped_column(default=1)
    start_date: Mapped[date] = mapped_column(Date)
    active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    initiative: Mapped[Initiative] = relationship(lazy="joined")


class LogEntry(Base):
    """Something actually worked on during a day."""

    __tablename__ = "log_entries"
    __table_args__ = (
        CheckConstraint("quadrant BETWEEN 1 AND 4", name="ck_log_quadrant"),
        CheckConstraint("minutes >= 0", name="ck_log_minutes"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    initiative_id: Mapped[int] = mapped_column(ForeignKey("initiatives.id", ondelete="CASCADE"))
    planned_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("planned_items.id", ondelete="SET NULL"), default=None
    )
    title: Mapped[str] = mapped_column(String(300))
    quadrant: Mapped[int]
    minutes: Mapped[int] = mapped_column(default=30)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)

    initiative: Mapped[Initiative] = relationship(lazy="joined")


class AppState(Base):
    """Small key/value store: user preferences (JSON) and generated secrets such as VAPID keys."""

    __tablename__ = "app_state"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)


class PushSubscription(Base):
    """A browser's Web Push subscription (one per device/browser profile)."""

    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    endpoint: Mapped[str] = mapped_column(Text, unique=True)
    p256dh: Mapped[str] = mapped_column(String(200))
    auth: Mapped[str] = mapped_column(String(100))
    user_agent: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class NotificationLog(Base):
    """One row per event evaluation and channel delivery; makes scheduled reminders idempotent."""

    __tablename__ = "notification_log"
    __table_args__ = (Index("ix_notification_log_kind_date", "kind", "date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(32))
    date: Mapped[date] = mapped_column(Date)
    channel: Mapped[str] = mapped_column(String(32))  # "-" when the event was skipped
    ok: Mapped[bool]
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class OAuthClient(Base):
    """A dynamically registered OAuth client (an AI agent / MCP client)."""

    __tablename__ = "oauth_clients"

    client_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    info: Mapped[str] = mapped_column(Text)  # OAuthClientInformationFull as JSON
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class OAuthGrant(Base):
    """Short-lived authorization state: a pending consent request or an issued auth code.

    `key` is a random id for pending requests and the SHA-256 of the code for issued codes.
    """

    __tablename__ = "oauth_grants"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))  # "pending" | "code"
    client_id: Mapped[str] = mapped_column(
        ForeignKey("oauth_clients.client_id", ondelete="CASCADE"), index=True
    )
    data: Mapped[str] = mapped_column(Text)  # JSON
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime())


class OAuthToken(Base):
    """An issued access or refresh token, stored only as a SHA-256 hash.

    Tokens from one authorization share a `family`, so revoking any of them revokes all.
    """

    __tablename__ = "oauth_tokens"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))  # "access" | "refresh"
    family: Mapped[str] = mapped_column(String(32), index=True)
    client_id: Mapped[str] = mapped_column(
        ForeignKey("oauth_clients.client_id", ondelete="CASCADE"), index=True
    )
    scopes: Mapped[str] = mapped_column(String(200))  # space-separated
    resource: Mapped[str | None] = mapped_column(String(300), default=None)
    expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), default=None)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), default=None)
