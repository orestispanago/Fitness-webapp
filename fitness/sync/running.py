from datetime import date

from fitness.sync.common import find_activity_start_date, store_new

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
    start = find_activity_start_date(conn, "runs")
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


def sync_all(conn, client):
    sync_runs(conn, client)
