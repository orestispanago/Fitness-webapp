from fitness.sync.common import format_sync_counts, store_by_id, update_rows

# Garmin's automatic name for a run nobody renamed: "<Location> Running"
GARMIN_NAME_SUFFIX = " Running"

# Columns taken from the activity list, compared on every sync
RUN_COLUMNS = [
    "activity_id",
    "start_time_local",
    "distance_m",
    "duration_s",
    "avg_hr",
    "location",
    "run_type",
    "activity_name",
]

WEATHER_COLUMNS = [
    "activity_id",
    "temp_c",
    "apparent_temp_c",
    "relative_humidity",
]


# runs


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


def build_run_row(activity):
    name = activity["activityName"]
    location, run_type = parse_run_name(name)
    avg_hr = None
    if activity.get("averageHR") is not None:
        avg_hr = round(activity["averageHR"])
    return (
        activity["activityId"],
        activity["startTimeLocal"],
        activity["distance"],
        activity["duration"],
        avg_hr,
        location,
        run_type,
        name,
    )


def parse_runs(activities):
    rows = []
    for activity in activities:
        if not is_run(activity):
            continue
        rows.append(build_run_row(activity))
    return rows


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


def sync_weather(conn, client, activity_ids):
    rows = []
    for activity_id in activity_ids:
        weather = fetch_run_weather(client, activity_id)
        rows.append((activity_id,) + parse_weather(weather))
    update_rows(conn, "runs", WEATHER_COLUMNS, rows)


def sync_runs(conn, client, activities):
    rows = parse_runs(activities)
    new_ids, changed_ids, deleted_ids = store_by_id(
        conn, "runs", RUN_COLUMNS, rows
    )
    # Weather is fetched once, for new runs only
    sync_weather(conn, client, new_ids)
    print(format_sync_counts("runs", len(rows), new_ids, changed_ids, deleted_ids))


def sync_all(conn, client, activities):
    sync_runs(conn, client, activities)
