from datetime import date

from tobox.recurrence import due_dates, is_due

MON = date(2026, 3, 2)


def test_weekly_on_chosen_weekdays() -> None:
    mwf = [0, 2, 4]
    assert [d.day for d in due_dates(mwf, 1, MON, MON, date(2026, 3, 15))] == [2, 4, 6, 9, 11, 13]


def test_never_before_the_start_date() -> None:
    wednesday = date(2026, 3, 4)
    assert not is_due([0, 2], 1, wednesday, MON)
    assert is_due([0, 2], 1, wednesday, wednesday)


def test_every_other_week_counts_from_the_start_week() -> None:
    # Starts on a Thursday; the Tuesday of that same week is before the start, so the first
    # occurrence is two weeks later.
    start = date(2026, 3, 5)
    got = list(due_dates([1], 2, start, MON, date(2026, 4, 5)))
    assert got == [date(2026, 3, 17), date(2026, 3, 31)]


def test_range_outside_the_start_is_empty() -> None:
    assert list(due_dates([0], 1, MON, date(2026, 2, 1), date(2026, 3, 1))) == []
