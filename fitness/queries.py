from fitness.db import get_db


def load_daily_points(table, value_column):
    """Chart.js {x: date, y: value} points for a daily table, oldest first."""
    # Identifiers are internal constants, never user input.
    rows = get_db().execute(
        f"SELECT calendar_date, {value_column} AS value"
        f" FROM {table} ORDER BY calendar_date"
    ).fetchall()
    points = []
    for row in rows:
        point = {"x": row["calendar_date"], "y": row["value"]}
        points.append(point)
    return points


def load_vo2max():
    return load_daily_points("vo2max", "vo2max_precise_value")


def load_resting_hr():
    return load_daily_points("resting_hr", "resting_hr_bpm")


def load_hrv():
    return load_daily_points("hrv", "hrv_value")


def load_weight():
    return load_daily_points("weight", "weight_kg")


def load_acwr():
    return load_daily_points("training_load", "acwr_ratio")


def minutes_to_hours(minutes):
    hours = None
    if minutes is not None:
        hours = round(minutes / 60, 2)
    return hours


def load_sleep():
    """Duration and need as two point lists, in hours."""
    rows = get_db().execute(
        "SELECT calendar_date, sleep_duration_minutes, sleep_need_minutes"
        " FROM sleep ORDER BY calendar_date"
    ).fetchall()
    duration = []
    need = []
    for row in rows:
        day = row["calendar_date"]
        hours_slept = minutes_to_hours(row["sleep_duration_minutes"])
        hours_needed = minutes_to_hours(row["sleep_need_minutes"])
        duration.append({"x": day, "y": hours_slept})
        need.append({"x": day, "y": hours_needed})
    return {"duration": duration, "need": need}
