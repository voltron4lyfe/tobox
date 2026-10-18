"""ORM models.

Quadrants follow Covey's time-management matrix:
  1 = Important & Urgent       (crises, deadlines)
  2 = Important & Not Urgent   (planning, growth, relationships) -- the goal
  3 = Not Important & Urgent   (interruptions, some meetings)
  4 = Not Important & Not Urgent (busywork, time-wasters)

Planned items and log entries snapshot the initiative's quadrant at creation
time so history stays accurate if an initiative is later re-classified.
"""

import enum
from datetime import UTC, date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from tobox.db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class Day(Base):
    """A calendar day: the morning plan's intention and the evening review."""

    __tablename__ = "days"
    __table_args__ = (
        CheckConstraint("rating IS NULL OR rating BETWEEN 1 AND 5", name="ck_day_rating"),
    )

    date: Mapped[date] = mapped_column(Date, primary_key=True)
    intention: Mapped[str] = mapped_column(Text, default="")
    planned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    reflection: Mapped[str] = mapped_column(Text, default="")
    rating: Mapped[int | None] = mapped_column(default=None)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    initiative: Mapped[Initiative] = relationship(lazy="joined")
