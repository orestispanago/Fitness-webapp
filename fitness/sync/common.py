import sqlite3
from datetime import date, timedelta

from fitness.config import DB_PATH, FIRST_DATA_DATE


def open_connection():
    # mode=rw: fail if the DB doesn't exist instead of creating an empty one
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=rw", uri=True)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def split_date_windows(start, end, max_days):
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


def list_days_in_range(start, end):
    days = []
    day = date.fromisoformat(start)
    last = date.fromisoformat(end)
    while day <= last:
        days.append(day.isoformat())
        day = day + timedelta(days=1)
    return days


# Activity tables (runs, strength_sessions): synced by activity_id over the
# whole history, see "Activity sync by ID" in SPEC.md. Identifiers below are
# internal constants, never user input; columns always start with
# activity_id.


def fetch_all_activities(client):
    end = date.today().isoformat()
    return client.get_activities_by_date(FIRST_DATA_DATE, end)


def load_stored_rows(conn, table, columns):
    """Stored rows as tuples of columns, keyed on activity_id."""
    rows = conn.execute(f"SELECT {', '.join(columns)} FROM {table}").fetchall()
    stored = {}
    for row in rows:
        stored[row[0]] = row
    return stored


def insert_rows(conn, table, columns, rows):
    placeholders = ", ".join(["?"] * len(columns))
    conn.executemany(
        f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({placeholders})",
        rows,
    )


def update_rows(conn, table, columns, rows):
    """Overwrite the given columns of stored rows, matched on activity_id."""
    assignments = []
    for column in columns[1:]:
        assignments.append(f"{column} = ?")
    params = []
    for row in rows:
        params.append(tuple(row[1:]) + (row[0],))
    conn.executemany(
        f"UPDATE {table} SET {', '.join(assignments)} WHERE activity_id = ?",
        params,
    )


def delete_rows(conn, table, activity_ids):
    params = []
    for activity_id in activity_ids:
        params.append((activity_id,))
    conn.executemany(f"DELETE FROM {table} WHERE activity_id = ?", params)


def find_new_rows(rows, stored):
    new_rows = []
    for row in rows:
        if row[0] not in stored:
            new_rows.append(row)
    return new_rows


def find_changed_rows(rows, stored):
    changed_rows = []
    for row in rows:
        if row[0] not in stored:
            continue
        if tuple(row) != tuple(stored[row[0]]):
            changed_rows.append(row)
    return changed_rows


def find_missing_ids(rows, stored):
    """Stored activity_ids that are no longer in Garmin's list."""
    found_ids = set()
    for row in rows:
        found_ids.add(row[0])
    missing_ids = []
    for activity_id in stored:
        if activity_id not in found_ids:
            missing_ids.append(activity_id)
    return missing_ids


def collect_ids(rows):
    activity_ids = []
    for row in rows:
        activity_ids.append(row[0])
    return activity_ids


def store_by_id(conn, table, columns, rows):
    """Insert new, update changed, delete missing; returns the three id lists."""
    stored = load_stored_rows(conn, table, columns)
    new_rows = find_new_rows(rows, stored)
    changed_rows = find_changed_rows(rows, stored)
    deleted_ids = find_missing_ids(rows, stored)
    # Guard: an empty list most likely means a bad read, not that every
    # activity was deleted in Garmin
    if not rows:
        deleted_ids = []
    insert_rows(conn, table, columns, new_rows)
    update_rows(conn, table, columns, changed_rows)
    delete_rows(conn, table, deleted_ids)
    return collect_ids(new_rows), collect_ids(changed_rows), deleted_ids


def format_sync_counts(table, found, new_ids, changed_ids, deleted_ids):
    return (
        f"{table}: {found} in Garmin, {len(new_ids)} new,"
        f" {len(changed_ids)} updated, {len(deleted_ids)} deleted"
    )
