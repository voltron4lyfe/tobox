"""MCP server: lets AI agents read and update the user's Tobox over OAuth-protected HTTP.

Tools are thin wrappers over `tobox.ops`, so agents obey exactly the same rules as the web UI.
Every tool needs `tobox:read`; anything that changes data also needs `tobox:write`.
"""

from collections.abc import Callable
from datetime import date, timedelta
from typing import Annotated, Any, Literal

from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.provider import OAuthAuthorizationServerProvider
from mcp.server.auth.settings import AuthSettings
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import Field
from sqlalchemy.orm import Session

from tobox import ops, prefs, services
from tobox.agents.oauth import WRITE
from tobox.errors import DomainError
from tobox.schemas import (
    CarryForwardRequest,
    DayOut,
    DayUpdate,
    InitiativeCreate,
    InitiativeOut,
    InitiativeUpdate,
    LogEntryCreate,
    LogEntryUpdate,
    MetricsOut,
    PlannedItemCreate,
    PlannedItemUpdate,
    RoleCreate,
    RoleOut,
    RoleUpdate,
    RoutineCreate,
    RoutineOut,
    RoutineUpdate,
    Weekday,
)

INSTRUCTIONS = """\
Tobox tracks whether the user works on what matters most each day, using Covey's
Important/Urgent matrix.

- Initiatives are ongoing efforts, each in a quadrant: 1 Necessity (urgent+important),
  2 Effectiveness (important, not urgent: the goal), 3 Distraction (urgent, not important),
  4 Waste. An initiative may belong to a role (Covey: Parent, Professional, Health…), the
  areas of life the user wants to keep in balance.
- Routines are recurring items (a weekly class, soccer practice) on set weekdays. They are
  not planned automatically: get_day lists `routines_due`, and plan_routines adds them.
- Each day has a ranked plan of at most 6 items; rank #1 is the Highlight, the one thing that
  would make the day a win. Log entries record work actually done (minutes), optionally linked
  to a planned item. An evening review adds a 1-5 rating and a reflection.
- Dates are the user's local calendar days, YYYY-MM-DD. Omit `date` to mean today.
- Read before writing: call get_day first, reuse existing initiative ids, and never invent
  initiatives the user didn't confirm. Prefer logging against a planned item when one fits.
- Use the end_of_day_review prompt to walk the user through their daily review.
"""

DateArg = Annotated[str | None, Field(description="YYYY-MM-DD; omit for today")]
READ_ONLY = ToolAnnotations(read_only_hint=True, open_world_hint=False)
WRITES = ToolAnnotations(read_only_hint=False, destructive_hint=False, open_world_hint=False)
DESTRUCTIVE = ToolAnnotations(read_only_hint=False, destructive_hint=True, open_world_hint=False)


def build_server(
    session_factory: Callable[[], Session],
    version: str,
    *,
    auth_server_provider: OAuthAuthorizationServerProvider[Any, Any, Any] | None = None,
    auth: AuthSettings | None = None,
) -> MCPServer:
    """The MCP server with all tools and prompts; HTTP transport is attached by `mount`."""

    def session() -> Session:
        return session_factory()

    def day_of(s: Session, value: str | None) -> date:
        if not value:
            return prefs.local_today(s)
        try:
            return date.fromisoformat(value)
        except ValueError as exc:
            raise ToolError(f"invalid date {value!r}: use YYYY-MM-DD") from exc

    def need_write() -> None:
        token = get_access_token()
        if token is None or WRITE not in token.scopes:
            raise ToolError(
                "This agent has read-only access. Reconnect it and allow 'Make changes'."
            )

    def run[T](fn: Callable[[Session], T]) -> T:
        try:
            with session() as s:
                return fn(s)
        except DomainError as exc:
            raise ToolError(exc.detail) from exc

    server: MCPServer = MCPServer(
        name="tobox",
        title="Tobox",
        description="Daily Important/Urgent planning, tracking, and review",
        instructions=INSTRUCTIONS,
        version=version,
        auth_server_provider=auth_server_provider,
        auth=auth,
    )

    # --- Read ---------------------------------------------------------------------------

    @server.tool(annotations=READ_ONLY)
    def get_day(date: DateArg = None) -> DayOut:
        """A day's plan (ranked items, #1 = Highlight), work logs, review, and summary metrics."""
        return run(lambda s: services.build_day(s, day_of(s, date)))

    @server.tool(annotations=READ_ONLY)
    def list_initiatives(include_inactive: bool = False) -> list[InitiativeOut]:
        """Initiatives with their quadrant (1-4) and status. Archived ones only if asked."""
        return run(
            lambda s: [
                InitiativeOut.model_validate(i)
                for i in ops.list_initiatives(s, include_archived=include_inactive)
                if include_inactive or i.status == "active"
            ]
        )

    @server.tool(annotations=READ_ONLY)
    def list_roles() -> list[RoleOut]:
        """The user's roles (areas of life), in their order."""
        return run(lambda s: [RoleOut.model_validate(r) for r in ops.list_roles(s)])

    @server.tool(annotations=READ_ONLY)
    def list_routines(include_inactive: bool = False) -> list[RoutineOut]:
        """Recurring items: weekdays (0 = Monday), every N weeks from start_date."""
        return run(
            lambda s: [RoutineOut.model_validate(r) for r in ops.list_routines(s, include_inactive)]
        )

    @server.tool(annotations=READ_ONLY)
    def get_metrics(
        days: Annotated[int, Field(ge=1, le=366)] = 7,
        end: DateArg = None,
    ) -> MetricsOut:
        """Trends over the `days` ending on `end`: Highlight hit rate, streaks, Q2 share, plan
        adherence, time per initiative and per role, routine adherence, and per-day summaries."""

        def fn(s: Session) -> MetricsOut:
            last = day_of(s, end)
            return ops.metrics(s, last - timedelta(days=days - 1), last)

        return run(fn)

    # --- Initiatives -------------------------------------------------------------------

    @server.tool(annotations=WRITES)
    def create_initiative(
        title: Annotated[str, Field(min_length=1, max_length=200)],
        quadrant: Annotated[int, Field(ge=1, le=4)],
        description: str = "",
        role_id: int | None = None,
    ) -> InitiativeOut:
        """Create an initiative. Confirm the name, quadrant, and role with the user first."""
        need_write()
        body = InitiativeCreate(
            title=title, quadrant=quadrant, description=description, role_id=role_id
        )
        return run(lambda s: InitiativeOut.model_validate(ops.create_initiative(s, body)))

    @server.tool(annotations=WRITES)
    def update_initiative(
        initiative_id: int,
        title: str | None = None,
        description: str | None = None,
        quadrant: Annotated[int, Field(ge=1, le=4)] | None = None,
        status: Literal["active", "paused", "done", "archived"] | None = None,
        role_id: int | None = None,
        clear_role: bool = False,
    ) -> InitiativeOut:
        """Rename, re-classify, move to a role (or clear_role), or change the status of an
        initiative (archive instead of deleting)."""
        need_write()
        fields = {
            "title": title,
            "description": description,
            "quadrant": quadrant,
            "status": status,
            "role_id": role_id,
        }
        body = InitiativeUpdate(**{k: v for k, v in fields.items() if v is not None})
        if clear_role:
            body.role_id = None
        return run(
            lambda s: InitiativeOut.model_validate(ops.update_initiative(s, initiative_id, body))
        )

    # --- Roles -------------------------------------------------------------------------

    @server.tool(annotations=WRITES)
    def create_role(name: Annotated[str, Field(min_length=1, max_length=60)]) -> RoleOut:
        """Create a role (e.g. Parent, Professional, Health). Confirm with the user first."""
        need_write()
        return run(lambda s: RoleOut.model_validate(ops.create_role(s, RoleCreate(name=name))))

    @server.tool(annotations=WRITES)
    def update_role(
        role_id: int,
        name: Annotated[str, Field(min_length=1, max_length=60)] | None = None,
        sort_order: int | None = None,
    ) -> RoleOut:
        """Rename or reorder a role."""
        need_write()
        body = RoleUpdate(name=name, sort_order=sort_order)
        return run(lambda s: RoleOut.model_validate(ops.update_role(s, role_id, body)))

    @server.tool(annotations=DESTRUCTIVE)
    def delete_role(role_id: int) -> str:
        """Delete a role. Its initiatives stay, without a role."""
        need_write()
        run(lambda s: ops.delete_role(s, role_id))
        return "deleted"

    # --- Routines ------------------------------------------------------------------------

    @server.tool(annotations=WRITES)
    def create_routine(
        initiative_id: int,
        weekdays: Annotated[list[Weekday], Field(min_length=1, max_length=7)],
        title: str = "",
        estimate_minutes: Annotated[int, Field(ge=0, le=1440)] = 30,
        every_weeks: Annotated[int, Field(ge=1, le=12)] = 1,
        start_date: DateArg = None,
    ) -> RoutineOut:
        """Create a recurring item on `weekdays` (0 = Monday) every `every_weeks` weeks from
        `start_date` (default today). Confirm the schedule with the user first."""
        need_write()

        def fn(s: Session) -> RoutineOut:
            body = RoutineCreate(
                initiative_id=initiative_id,
                title=title,
                estimate_minutes=estimate_minutes,
                weekdays=weekdays,
                every_weeks=every_weeks,
                start_date=day_of(s, start_date),
            )
            return RoutineOut.model_validate(ops.create_routine(s, body))

        return run(fn)

    @server.tool(annotations=WRITES)
    def update_routine(
        routine_id: int,
        title: str | None = None,
        estimate_minutes: Annotated[int, Field(ge=0, le=1440)] | None = None,
        weekdays: Annotated[list[Weekday], Field(min_length=1, max_length=7)] | None = None,
        every_weeks: Annotated[int, Field(ge=1, le=12)] | None = None,
        active: bool | None = None,
        initiative_id: int | None = None,
    ) -> RoutineOut:
        """Change a routine's schedule or details, or pause it (active=false)."""
        need_write()
        fields = {
            "title": title,
            "estimate_minutes": estimate_minutes,
            "weekdays": weekdays,
            "every_weeks": every_weeks,
            "active": active,
            "initiative_id": initiative_id,
        }
        body = RoutineUpdate(**{k: v for k, v in fields.items() if v is not None})
        return run(lambda s: RoutineOut.model_validate(ops.update_routine(s, routine_id, body)))

    @server.tool(annotations=DESTRUCTIVE)
    def delete_routine(routine_id: int) -> str:
        """Delete a routine. Items already planned from it stay on their days."""
        need_write()
        run(lambda s: ops.delete_routine(s, routine_id))
        return "deleted"

    # --- Plan --------------------------------------------------------------------------

    @server.tool(annotations=WRITES)
    def add_plan_item(
        initiative_id: int,
        title: str = "",
        estimate_minutes: Annotated[int, Field(ge=0, le=1440)] = 30,
        make_highlight: bool = False,
        date: DateArg = None,
    ) -> DayOut:
        """Add an item to a day's plan (max 6). The first item becomes the Highlight."""
        need_write()
        body = PlannedItemCreate(
            initiative_id=initiative_id,
            title=title,
            estimate_minutes=estimate_minutes,
            is_highlight=make_highlight,
        )
        return run(lambda s: ops.add_item(s, day_of(s, date), body))

    @server.tool(annotations=WRITES)
    def update_plan_item(
        item_id: int,
        title: str | None = None,
        estimate_minutes: Annotated[int, Field(ge=0, le=1440)] | None = None,
        done: bool | None = None,
        make_highlight: bool | None = None,
        initiative_id: int | None = None,
    ) -> DayOut:
        """Edit a planned item, mark it done, or make it the Highlight."""
        need_write()
        fields = {
            "title": title,
            "estimate_minutes": estimate_minutes,
            "done": done,
            "is_highlight": make_highlight,
            "initiative_id": initiative_id,
        }
        body = PlannedItemUpdate(**{k: v for k, v in fields.items() if v is not None})
        return run(lambda s: ops.update_item(s, item_id, body))

    @server.tool(annotations=WRITES)
    def plan_routines(routine_ids: list[int] | None = None, date: DateArg = None) -> DayOut:
        """Add routines to a day's plan: all that are due (get_day's routines_due), or the
        given ones. Counts toward the 6-item limit."""
        need_write()
        return run(lambda s: ops.plan_routines(s, day_of(s, date), routine_ids))

    @server.tool(annotations=DESTRUCTIVE)
    def remove_plan_item(item_id: int) -> DayOut:
        """Remove an item from a day's plan. Logged work stays, unlinked."""
        need_write()
        return run(lambda s: ops.delete_item(s, item_id))

    @server.tool(annotations=WRITES)
    def reorder_plan(item_ids: list[int], date: DateArg = None) -> DayOut:
        """Set the full ranked order of a day's items; the first becomes the Highlight."""
        need_write()
        return run(lambda s: ops.reorder_items(s, day_of(s, date), item_ids))

    @server.tool(annotations=WRITES)
    def carry_forward(
        from_date: str,
        to_date: DateArg = None,
        item_ids: list[int] | None = None,
    ) -> DayOut:
        """Copy unfinished items from one day onto another (default: all unfinished, to
        today). Items already carried are skipped."""
        need_write()

        def fn(s: Session) -> DayOut:
            body = CarryForwardRequest(to_date=day_of(s, to_date), item_ids=item_ids)
            return ops.carry_forward(s, day_of(s, from_date), body)

        return run(fn)

    # --- Work log ------------------------------------------------------------------------

    @server.tool(annotations=WRITES)
    def log_work(
        minutes: Annotated[int, Field(ge=0, le=1440)],
        title: str = "",
        planned_item_id: int | None = None,
        initiative_id: int | None = None,
        mark_done: bool = False,
        date: DateArg = None,
    ) -> DayOut:
        """Record work actually done. Give planned_item_id when it advanced a planned item,
        otherwise initiative_id. `title` says what was done (e.g. 'drafted intro')."""
        need_write()
        body = LogEntryCreate(
            minutes=minutes,
            title=title,
            planned_item_id=planned_item_id,
            initiative_id=initiative_id,
            mark_done=mark_done,
        )
        return run(lambda s: ops.add_log(s, day_of(s, date), body))

    @server.tool(annotations=WRITES)
    def update_log(
        log_id: int,
        minutes: Annotated[int, Field(ge=0, le=1440)] | None = None,
        title: str | None = None,
        planned_item_id: int | None = None,
        initiative_id: int | None = None,
    ) -> DayOut:
        """Correct a work-log entry's minutes, description, or target."""
        need_write()
        fields = {
            "minutes": minutes,
            "title": title,
            "planned_item_id": planned_item_id,
            "initiative_id": initiative_id,
        }
        body = LogEntryUpdate(**{k: v for k, v in fields.items() if v is not None})
        return run(lambda s: ops.update_log(s, log_id, body))

    @server.tool(annotations=DESTRUCTIVE)
    def delete_log(log_id: int) -> DayOut:
        """Delete a work-log entry."""
        need_write()
        return run(lambda s: ops.delete_log(s, log_id))

    # --- Day / review ----------------------------------------------------------------------

    @server.tool(annotations=WRITES)
    def update_day(
        date: DateArg = None,
        intention: str | None = None,
        reflection: str | None = None,
        rating: Annotated[int, Field(ge=1, le=5)] | None = None,
        plan_committed: bool | None = None,
        review_complete: bool | None = None,
    ) -> DayOut:
        """Set the morning intention, or the evening review: reflection, 1-5 rating, and
        whether the review is complete. Agree the reflection and rating with the user."""
        need_write()
        fields = {
            "intention": intention,
            "reflection": reflection,
            "rating": rating,
            "planned": plan_committed,
            "reviewed": review_complete,
        }
        body = DayUpdate(**{k: v for k, v in fields.items() if v is not None})
        return run(lambda s: ops.update_day(s, day_of(s, date), body))

    # --- Prompts -------------------------------------------------------------------------

    @server.prompt(title="End-of-day review")
    def end_of_day_review(date: str = "") -> str:
        """Review today's priorities with the user and build a complete record of the day,
        pulling in activity from other tools you have access to."""
        when = date or "today"
        return f"""Help me review {when} in Tobox.

1. Call get_day{f'(date="{date}")' if date else ""} and list_initiatives. Summarise my plan:
   the Highlight first, then the other items with estimates, and what I've logged so far.
2. Gather what I actually did {when} from the other tools you can use (for example
   enterprise search such as Glean, calendar, email, chat, documents, code
   history). Keep it to my own activity on that date.
3. Match that activity to my planned items and initiatives. Show me a table of proposed log
   entries (what, minutes, target) for work not yet logged, plus anything that doesn't fit an
   existing initiative. Don't double-count work that's already logged.
4. After I confirm or edit the table, record it with log_work (mark items done when I say so).
5. Tell me plainly whether I worked on my Highlight, how much time went to Q2 versus Q1/Q3,
   and what pulled me off plan. Draft a two-to-four-sentence reflection.
6. Ask me for a 1-5 rating, then save reflection and rating with update_day and set
   review_complete=true. Offer to carry unfinished items to tomorrow with carry_forward.

Ask before every write. Never create initiatives without my confirmation."""

    @server.prompt(title="Morning plan")
    def morning_plan(date: str = "") -> str:
        """Plan the day: pick up to six items with the most important first."""
        when = date or "today"
        return f"""Help me plan {when} in Tobox.

1. Call get_day for {when} and for the previous day, and list_initiatives.
2. Point out unfinished items from yesterday and offer to carry them forward, and the
   routines due {when} (routines_due in get_day); add the ones I keep with plan_routines.
3. Using what you know about my commitments {when} (calendar, messages, deadlines from other
   tools you can use), propose at most six items, ranked, with estimates. Put a Quadrant 2
   item first unless something genuinely urgent and important must come first. Keep total
   estimates under my available hours.
4. After I agree, add them with add_plan_item (or reorder_plan), then set plan_committed=true
   with update_day, along with a one-line intention if I give one."""

    return server
