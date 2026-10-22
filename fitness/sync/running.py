from datetime import date

from fitness.config import FIRST_DATA_DATE

BASE_HR_MARKER = "Base-HR"


# base_hr_runs


def runs_start_date(conn):
    """Calendar day of the latest stored run, or FIRST_DATA_DATE if none."""
    # Same day, not +1: a second run that day may not have been synced yet
    row = conn.execute(
        "SELECT MAX(start_time_local) FROM base_hr_runs"
    ).fetchone()
    start = FIRST_DATA_DATE
    if row[0] is not None:
        start = row[0][:10]
    return start


def fetch_runs(client, start, end):
    return client.get_activities_by_date(start, end, "running")


def is_base_hr_run(activity):
    type_key = (activity.get("activityType") or {}).get("typeKey")
    name = activity.get("activityName") or ""
    matches = False
    if type_key == "running" and BASE_HR_MARKER in name:
        matches = True
    return matches


def run_location(name):
    """'Jeddah - Base-HR' -> 'Jeddah'; None if the name has no ' - '."""
    location = None
    if " - " in name:
        location = name.split(" - ", 1)[0]
    return location


def parse_base_hr_runs(activities):
    rows = []
    for activity in activities:
        if not is_base_hr_run(activity):
            continue
        name = activity["activityName"]
        rows.append(
            (
                activity["activityId"],
                activity["startTimeLocal"],
                activity["distance"],
                activity["duration"],
                round(activity["averageHR"]),
                run_location(name),
                name,
            )
        )
    return rows


def store_new_base_hr_runs(conn, rows):
    """Insert runs not stored yet; returns how many were new."""
    cursor = conn.executemany(
        """
        INSERT OR IGNORE INTO base_hr_runs
            (activity_id, start_time_local, distance_m, duration_s,
             avg_hr, location, activity_name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    return cursor.rowcount


def sync_base_hr_runs(conn, client):
    start = runs_start_date(conn)
    end = date.today().isoformat()
    activities = fetch_runs(client, start, end)
    rows = parse_base_hr_runs(activities)
    new_count = store_new_base_hr_runs(conn, rows)
    print(
        f"base_hr_runs: {len(rows)} found, {new_count} new ({start} to {end})"
    )


# laps


def runs_without_laps(conn):
    """Stored runs whose laps haven't been fetched yet (normally new ones)."""
    rows = conn.execute(
        "SELECT activity_id FROM base_hr_runs"
        " WHERE activity_id NOT IN (SELECT activity_id FROM laps)"
        " ORDER BY start_time_local"
    ).fetchall()
    activity_ids = []
    for row in rows:
        activity_ids.append(row[0])
    return activity_ids


def parse_laps(activity_id, splits):
    rows = []
    for lap in splits.get("lapDTOs") or []:
        avg_hr = lap.get("averageHR")
        if avg_hr is None or lap.get("distance") is None:
            continue
        rows.append(
            (
                activity_id,
                lap["lapIndex"],
                lap["distance"],
                lap["duration"],
                round(avg_hr),
            )
        )
    return rows


def store_new_laps(conn, rows):
    """Insert laps not stored yet; returns how many were new."""
    cursor = conn.executemany(
        """
        INSERT OR IGNORE INTO laps
            (activity_id, lap_index, distance_m, duration_s, avg_hr)
        VALUES (?, ?, ?, ?, ?)
        """,
        rows,
    )
    return cursor.rowcount


def sync_laps(conn, client):
    # Laps don't change after a run, so each run's laps are fetched once
    activity_ids = runs_without_laps(conn)
    new_count = 0
    for activity_id in activity_ids:
        splits = client.get_activity_splits(activity_id)
        rows = parse_laps(activity_id, splits)
        new_count += store_new_laps(conn, rows)
    print(f"laps: {new_count} new for {len(activity_ids)} runs")


def sync_all(conn, client):
    sync_base_hr_runs(conn, client)
    sync_laps(conn, client)
