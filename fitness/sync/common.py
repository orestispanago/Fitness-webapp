import sqlite3
from datetime import date, timedelta

from fitness.config import DB_PATH, FIRST_DATA_DATE


def open_connection():
    # mode=rw: fail if the DB doesn't exist instead of creating an empty one
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=rw", uri=True)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def activity_start_date(conn, table):
    """Day of the latest start_time_local in table, or FIRST_DATA_DATE."""
    # Same day, not +1: a second activity that day may not have been synced
    # yet. Identifiers are internal constants, never user input.
    row = conn.execute(f"SELECT MAX(start_time_local) FROM {table}").fetchone()
    start = FIRST_DATA_DATE
    if row[0] is not None:
        start = row[0][:10]
    return start


def store_new(conn, table, columns, rows):
    """Insert rows whose key isn't stored yet; returns how many were new."""
    # Identifiers are internal constants, never user input.
    placeholders = ", ".join(["?"] * len(columns))
    cursor = conn.executemany(
        f"INSERT OR IGNORE INTO {table} ({', '.join(columns)})"
        f" VALUES ({placeholders})",
        rows,
    )
    return cursor.rowcount


def date_windows(start, end, max_days):
    """Split the inclusive ISO date range into windows of at most max_days."""
    windows = []
    window_start = date.fromisoformat(start)
    last = date.fromisoformat(end)
    while window_start <= last:
        window_end = window_start + timedelta(days=max_days - 1)
        if window_end > last:
            window_end = last
        windows.append((window_start.isoformat(), window_end.isoformat()))
        window_start = window_end + timedelta(days=1)
    return windows


def days_in_range(start, end):
    days = []
    day = date.fromisoformat(start)
    last = date.fromisoformat(end)
    while day <= last:
        days.append(day.isoformat())
        day = day + timedelta(days=1)
    return days
