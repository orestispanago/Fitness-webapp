from datetime import date, timedelta

from fitness.db import get_db

# Trailing window, in calendar days, for the rolling-average lines
ROLLING_DAYS = 7


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


def window_mean(values_by_day, day, days):
    """Mean of the non-null values in the `days` days ending on `day`."""
    total = 0
    count = 0
    for offset in range(days):
        value = values_by_day.get(day - timedelta(days=offset))
        if value is not None:
            total += value
            count += 1
    mean = None
    if count > 0:
        mean = round(total / count, 2)
    return mean


def rolling_average(points, days=ROLLING_DAYS):
    """Trailing `days`-day mean at each point's date, same {x, y} shape."""
    values_by_day = {}
    for point in points:
        values_by_day[date.fromisoformat(point["x"])] = point["y"]
    averages = []
    for point in points:
        day = date.fromisoformat(point["x"])
        mean = window_mean(values_by_day, day, days)
        averages.append({"x": point["x"], "y": mean})
    return averages


def load_vo2max():
    return load_daily_points("vo2max", "vo2max_precise_value")


def load_resting_hr():
    return load_daily_points("resting_hr", "resting_hr_bpm")


def load_hrv():
    return load_daily_points("hrv", "hrv_value")


def load_hrv_baseline():
    """Per day: Garmin's HRV status and baseline limits (nulls kept)."""
    rows = get_db().execute(
        "SELECT calendar_date, hrv_status, baseline_low_upper,"
        " baseline_balanced_low, baseline_balanced_upper"
        " FROM hrv ORDER BY calendar_date"
    ).fetchall()
    days = []
    for row in rows:
        days.append({
            "x": row["calendar_date"],
            "status": row["hrv_status"],
            "low_upper": row["baseline_low_upper"],
            "balanced_low": row["baseline_balanced_low"],
            "balanced_upper": row["baseline_balanced_upper"],
        })
    return days


def load_weight():
    return load_daily_points("weight", "weight_kg")


def load_sleep_shortfall():
    """Per night: sleep minus need in minutes (negative = short), and sleep."""
    rows = get_db().execute(
        "SELECT calendar_date, sleep_duration_minutes, sleep_need_minutes"
        " FROM sleep ORDER BY calendar_date"
    ).fetchall()
    points = []
    for row in rows:
        shortfall = None
        if row["sleep_duration_minutes"] is not None:
            shortfall = (
                row["sleep_duration_minutes"] - row["sleep_need_minutes"]
            )
        points.append({
            "x": row["calendar_date"],
            "y": shortfall,
            "slept": row["sleep_duration_minutes"],
        })
    return points


def load_acwr():
    return load_daily_points("training_load", "acwr_ratio")
