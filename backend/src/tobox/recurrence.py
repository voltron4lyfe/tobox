"""When a routine is due: pure date arithmetic, no DB."""

from collections.abc import Iterator, Sequence
from datetime import date, timedelta


def is_due(weekdays: Sequence[int], every_weeks: int, start: date, day: date) -> bool:
    """Due on `weekdays` (0 = Monday) of every `every_weeks`-th week, counting from the
    calendar week (Monday to Sunday) that contains `start`, and never before `start`."""
    if day < start or day.weekday() not in weekdays:
        return False
    first_monday = start - timedelta(days=start.weekday())
    return ((day - first_monday).days // 7) % every_weeks == 0


def due_dates(
    weekdays: Sequence[int], every_weeks: int, start: date, first: date, last: date
) -> Iterator[date]:
    """Every due day in [first, last]."""
    day = max(first, start)
    while day <= last:
        if is_due(weekdays, every_weeks, start, day):
            yield day
        day += timedelta(days=1)
