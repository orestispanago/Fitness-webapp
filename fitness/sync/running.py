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


def fetch_run_weather(client, activity_id):
    return client.get_activity_weather(activity_id)


def fahrenheit_to_celsius(value):
    celsius = None
    if value is not None:
        celsius = round((value - 32) * 5 / 9, 1)
    return celsius


def parse_weather(weather):
    """(temp_c, apparent_temp_c, relative_humidity); all None without a report."""
    temp_c = None
    apparent_temp_c = None
    relative_humidity = None
    if weather:
        temp_c = fahrenheit_to_celsius(weather.get("temp"))
        apparent_temp_c = fahrenheit_to_celsius(weather.get("apparentTemp"))
        relative_humidity = weather.get("relativeHumidity")
    return temp_c, apparent_temp_c, relative_humidity


def parse_runs(client, activities):
    rows = []
    for activity in activities:
        if not is_run(activity):
            continue
        name = activity["activityName"]
        location, run_type = parse_run_name(name)
        avg_hr = None
        if activity.get("averageHR") is not None:
            avg_hr = round(activity["averageHR"])
        weather = fetch_run_weather(client, activity["activityId"])
        temp_c, apparent_temp_c, relative_humidity = parse_weather(weather)
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
                temp_c,
                apparent_temp_c,
                relative_humidity,
            )
        )
    return rows


def sync_runs(conn, client):
    start = find_activity_start_date(conn, "runs")
    end = date.today().isoformat()
    activities = fetch_runs(client, start, end)
    rows = parse_runs(client, activities)
    columns = [
        "activity_id",
        "start_time_local",
        "distance_m",
        "duration_s",
        "avg_hr",
        "location",
        "run_type",
        "activity_name",
        "temp_c",
        "apparent_temp_c",
        "relative_humidity",
    ]
    new_count = store_new(conn, "runs", columns, rows)
    print(f"runs: {len(rows)} found, {new_count} new ({start} to {end})")


def sync_all(conn, client):
    sync_runs(conn, client)
