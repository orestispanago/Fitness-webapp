import sqlite3
from datetime import date, timedelta

from fitness.config import DB_PATH


def open_connection():
    # mode=rw: fail if the DB doesn't exist instead of creating an empty one
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=rw", uri=True)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


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
