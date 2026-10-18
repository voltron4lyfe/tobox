"""API request/response schemas (the HTTP contract; see frontend/src/api/schema.d.ts)."""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from tobox.models import InitiativeStatus

Quadrant = Annotated[int, Field(ge=1, le=4)]
Minutes = Annotated[int, Field(ge=0, le=24 * 60)]
Title = Annotated[str, Field(max_length=300)]
QuadrantMinutes = dict[str, int]  # keys "1".."4"


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Initiatives -------------------------------------------------------------


class InitiativeCreate(BaseModel):
    title: Annotated[str, Field(min_length=1, max_length=200)]
    description: str = ""
    quadrant: Quadrant
    status: InitiativeStatus = InitiativeStatus.active


class InitiativeUpdate(BaseModel):
    title: Annotated[str, Field(min_length=1, max_length=200)] | None = None
    description: str | None = None
    quadrant: Quadrant | None = None
    status: InitiativeStatus | None = None
    sort_order: int | None = None


class InitiativeOut(ORMModel):
    id: int
    title: str
    description: str
    quadrant: int
    status: InitiativeStatus
    sort_order: int
    created_at: datetime
    updated_at: datetime


# --- Planned items -------------------------------------------------------------


class PlannedItemCreate(BaseModel):
    initiative_id: int
    title: Title = ""
    estimate_minutes: Minutes = 30
    is_highlight: bool = False


class PlannedItemUpdate(BaseModel):
    initiative_id: int | None = None
    title: Title | None = None
    estimate_minutes: Minutes | None = None
    is_highlight: bool | None = None
    done: bool | None = None


class PlannedItemOut(ORMModel):
    id: int
    date: date
    initiative_id: int
    title: str
    quadrant: int
    estimate_minutes: int
    rank: int
    is_highlight: bool
    done: bool
    carried_from_id: int | None
    logged_minutes: int


class ReorderRequest(BaseModel):
    ids: list[int]


class CarryForwardRequest(BaseModel):
    to_date: date
    item_ids: list[int] | None = Field(
        default=None, description="Only carry these items (default: all unfinished)."
    )


# --- Log entries -------------------------------------------------------------------


class LogEntryCreate(BaseModel):
    """Either initiative_id or planned_item_id is required."""

    initiative_id: int | None = None
    planned_item_id: int | None = None
    title: Title = ""
    minutes: Minutes = 30
    mark_done: bool = Field(default=False, description="Also mark the linked planned item done.")


class LogEntryUpdate(BaseModel):
    initiative_id: int | None = None
    planned_item_id: int | None = None
    title: Title | None = None
    minutes: Minutes | None = None


class LogEntryOut(ORMModel):
    id: int
    date: date
    initiative_id: int
    planned_item_id: int | None
    title: str
    quadrant: int
    minutes: int
    created_at: datetime


# --- Days -------------------------------------------------------------------------

Verdict = Literal["done", "worked", "missed", "unplanned", "idle"]


class HighlightStatus(BaseModel):
    item_id: int
    title: str
    initiative_id: int
    quadrant: int
    logged_minutes: int
    done: bool


class DaySummary(BaseModel):
    planned_minutes: int
    actual_minutes: int
    planned_by_quadrant: QuadrantMinutes
    actual_by_quadrant: QuadrantMinutes
    # Share of actual time in Q1+Q2 / Q2 alone (0..1; 0 when nothing logged).
    important_share: float
    q2_share: float
    # Share of actual time spent on initiatives that were in the plan.
    plan_adherence: float
    unplanned_minutes: int
    items_planned: int
    items_done: int
    highlight: HighlightStatus | None
    # done: highlight finished; worked: time logged on it; missed: planned but untouched;
    # unplanned: worked without a highlight; idle: nothing planned or logged.
    verdict: Verdict


class DayUpdate(BaseModel):
    intention: str | None = None
    reflection: str | None = None
    rating: Annotated[int, Field(ge=1, le=5)] | None = None
    planned: bool | None = Field(default=None, description="Mark the morning plan committed.")
    reviewed: bool | None = Field(default=None, description="Mark the evening review complete.")


class DayOut(BaseModel):
    date: date
    intention: str
    planned_at: datetime | None
    reflection: str
    rating: int | None
    reviewed_at: datetime | None
    items: list[PlannedItemOut]
    logs: list[LogEntryOut]
    summary: DaySummary


# --- Metrics -------------------------------------------------------------------------


class DayMetrics(DaySummary):
    date: date
    rating: int | None


class InitiativeMetrics(BaseModel):
    initiative_id: int
    title: str
    quadrant: int
    status: InitiativeStatus
    actual_minutes: int
    planned_minutes: int
    days_worked: int
    highlight_days: int


class MetricsSummary(BaseModel):
    days_tracked: int
    total_minutes: int
    actual_by_quadrant: QuadrantMinutes
    planned_by_quadrant: QuadrantMinutes
    important_share: float
    q2_share: float
    avg_plan_adherence: float
    highlight_days: int
    highlight_hit_rate: float
    # Logged / planned minutes over days that had a plan.
    plan_accuracy: float
    current_streak: int
    longest_streak: int
    avg_rating: float | None


class MetricsOut(BaseModel):
    start: date
    end: date
    summary: MetricsSummary
    days: list[DayMetrics]
    initiatives: list[InitiativeMetrics]


# --- Preferences -------------------------------------------------------------------


class Defaulted(BaseModel):
    """Responses always include defaulted fields, so generated TS types mark them required."""

    model_config = ConfigDict(json_schema_serialization_defaults_required=True)


Theme = Literal["system", "light", "dark"]
ClockTime = Annotated[str, Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$", examples=["08:30"])]
Weekday = Annotated[int, Field(ge=0, le=6, description="0 = Monday … 6 = Sunday")]
EventKind = Literal["plan_reminder", "highlight_nudge", "review_reminder"]


class ReminderPref(Defaulted):
    enabled: bool = True
    time: ClockTime


class WebPushPref(Defaulted):
    enabled: bool = False


class DiscordPref(Defaulted):
    enabled: bool = False
    webhook_url: Annotated[
        str, Field(pattern=r"^(|https://(discord\.com|discordapp\.com)/api/webhooks/\S+)$")
    ] = ""


class ChannelPrefs(Defaulted):
    """One entry per delivery channel. Add a field here when adding a channel to `notify`."""

    webpush: WebPushPref = WebPushPref()
    discord: DiscordPref = DiscordPref()


class NotificationPrefs(Defaulted):
    plan_reminder: ReminderPref = ReminderPref(time="08:30")
    highlight_nudge: ReminderPref = ReminderPref(time="14:00")
    review_reminder: ReminderPref = ReminderPref(time="17:30")
    days: list[Weekday] = Field(default=[0, 1, 2, 3, 4], description="Weekdays reminders run")
    channels: ChannelPrefs = ChannelPrefs()


class Preferences(Defaulted):
    theme: Theme = "system"
    # IANA zone for "today" and reminder times; None until the browser reports one.
    timezone: str | None = None
    notifications: NotificationPrefs = NotificationPrefs()


# --- Notifications -----------------------------------------------------------------


class Delivery(Defaulted):
    channel: str
    ok: bool
    detail: str = ""


class NotificationTestOut(BaseModel):
    deliveries: list[Delivery]


class ChannelInfo(Defaulted):
    name: str
    label: str
    enabled: bool
    ready: bool = Field(description="Configured well enough to deliver (e.g. has a device).")
    detail: str = ""


class NotificationLogOut(ORMModel):
    id: int
    kind: str
    date: date
    channel: str
    ok: bool
    detail: str
    created_at: datetime


class WebPushKeys(BaseModel):
    p256dh: str
    auth: str


class WebPushSubscriptionIn(BaseModel):
    endpoint: Annotated[str, Field(pattern=r"^https://")]
    keys: WebPushKeys


class WebPushUnsubscribe(BaseModel):
    endpoint: str


class WebPushConfig(BaseModel):
    public_key: str
    subscriptions: int


# --- AI agents (MCP OAuth clients) ---------------------------------------------------


class AgentOut(BaseModel):
    client_id: str
    name: str
    scopes: list[str]
    connected_at: datetime
    last_used_at: datetime | None


class McpInfo(BaseModel):
    url: str
    issuer: str
    password_required: bool
