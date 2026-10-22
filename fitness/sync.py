import sqlite3
from datetime import date

from fitness.config import DB_PATH
from fitness.garmin_client import get_client

BOOTSTRAP_START = "2000-01-01"


def open_connection():
    # mode=rw: fail if the DB doesn't exist instead of creating an empty one
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=rw", uri=True)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# vo2max


def vo2max_start_date(conn):
    row = conn.execute("SELECT MAX(calendar_date) FROM vo2max").fetchone()
    start = row[0]
    if start is None:
        start = BOOTSTRAP_START
    return start


def parse_vo2max(entries):
    rows = []
    for entry in entries:
        generic = entry.get("generic")
        if generic is None:
            continue
        value = generic.get("vo2MaxPreciseValue")
        if value is None:
            continue
        rows.append((generic["calendarDate"], value))
    return rows


def upsert_vo2max(conn, rows):
    conn.executemany(
        """
        INSERT INTO vo2max (calendar_date, vo2max_precise_value)
        VALUES (?, ?)
        ON CONFLICT (calendar_date)
        DO UPDATE SET vo2max_precise_value = excluded.vo2max_precise_value
        """,
        rows,
    )


def sync_vo2max(conn, client):
    start = vo2max_start_date(conn)
    end = date.today().isoformat()
    entries = client.get_max_metrics_range(start, end)
    rows = parse_vo2max(entries)
    upsert_vo2max(conn, rows)
    print(f"vo2max: {len(rows)} rows upserted ({start} to {end})")


def main():
    client = get_client()
    conn = open_connection()
    try:
        sync_vo2max(conn, client)
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    main()
