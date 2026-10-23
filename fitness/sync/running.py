from datetime import date

from fitness.config import BASE_HR_RUN_TYPE
from fitness.sync.common import activity_start_date, store_new

# Garmin's automatic name for a run nobody renamed: "<Location> Running"
GARMIN_NAME_SUFFIX = " Running"


# runs


def fetch_runs(client, start, end):
    return client.get_activities_by_date(start, end, "running")


def is_run(activity):
    type_key = (activity.get("activityType") or {}).get("typeKey")
    matches = False
    if type_key == "running":
        matches = True
    return matches


def parse_run_name(name):
    """(location, run_type): '<Location> - <Type>' or '<Location> Running'."""
    location = None
    run_type = None
    if " - " in name:
        location, run_type = name.split(" - ", 1)
    elif name.endswith(GARMIN_NAME_SUFFIX):
        location = name[: -len(GARMIN_NAME_SUFFIX)]
    return location, run_type


def parse_runs(activities):
    rows = []
    for activity in activities:
        if not is_run(activity):
            continue
        name = activity["activityName"]
        location, run_type = parse_run_name(name)
        avg_hr = None
        if activity.get("averageHR") is not None:
            avg_hr = round(activity["averageHR"])
        rows.append(
            (
                activity["activityId"],
                activity["startTimeLocal"],
                activity["distance"],
                activity["duration"],
                avg_hr,
                location,
                run_type,
                name,
            )
        )
    return rows


def sync_runs(conn, client):
    start = activity_start_date(conn, "runs")
    end = date.today().isoformat()
    activities = fetch_runs(client, start, end)
    rows = parse_runs(activities)
    columns = [
        "activity_id",
        "start_time_local",
        "distance_m",
        "duration_s",
        "avg_hr",
        "location",
        "run_type",
        "activity_name",
    ]
    new_count = store_new(conn, "runs", columns, rows)
    print(f"runs: {len(rows)} found, {new_count} new ({start} to {end})")


# laps


def runs_without_laps(conn):
    """Base-HR runs whose laps haven't been fetched yet (normally new ones)."""
    # Only base-HR laps are km splits that the charts use (see SPEC.md)
    rows = conn.execute(
        "SELECT activity_id FROM runs"
        " WHERE run_type = ?"
        " AND activity_id NOT IN (SELECT activity_id FROM laps)"
        " ORDER BY start_time_local",
        (BASE_HR_RUN_TYPE,),
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


def sync_laps(conn, client):
    # Laps don't change after a run, so each run's laps are fetched once
    activity_ids = runs_without_laps(conn)
    columns = [
        "activity_id",
        "lap_index",
        "distance_m",
        "duration_s",
        "avg_hr",
    ]
    new_count = 0
    for activity_id in activity_ids:
        splits = client.get_activity_splits(activity_id)
        rows = parse_laps(activity_id, splits)
        new_count += store_new(conn, "laps", columns, rows)
    print(f"laps: {new_count} new for {len(activity_ids)} runs")


def sync_all(conn, client):
    sync_runs(conn, client)
    sync_laps(conn, client)
