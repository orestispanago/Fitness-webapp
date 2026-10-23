from datetime import date, timedelta

from fitness.config import BASE_HR_RUN_TYPE
from fitness.db import get_db

# Trailing window, in calendar days, for the rolling-average lines
ROLLING_DAYS = 7

# Exercises on the strength chart, in chart order: label, the Garmin
# exercise names that count, and the category that counts when Garmin sent
# no name (see SPEC.md)
STRENGTH_EXERCISES = [
    {
        "label": "Squat (S1)",
        "names": ["BARBELL_BACK_SQUAT"],
        "category": None,
    },
    {
        "label": "Bench press (S2)",
        "names": ["BARBELL_BENCH_PRESS"],
        "category": None,
    },
    {
        "label": "Pull-up (S3)",
        "names": ["WEIGHTED_PULL_UP"],
        "category": "PULL_UP",
    },
    {
        "label": "Lateral raise (S4)",
        "names": ["DUMBBELL_LATERAL_RAISE"],
        "category": None,
    },
    {
        "label": "Romanian deadlift (S2)",
        "names": ["ROMANIAN_DEADLIFT"],
        "category": None,
    },
    {
        "label": "Seated cable row (S4)",
        "names": ["SEATED_CABLE_ROW"],
        "category": None,
    },
    {
        "label": "Wide-grip cable row (S1)",
        "names": ["WIDE_GRIP_SEATED_CABLE_ROW"],
        "category": None,
    },
    {
        "label": "Leg curl (S3)",
        "names": ["WEIGHTED_LEG_CURL"],
        "category": None,
    },
    {
        "label": "Leg extension (S3)",
        "names": ["WEIGHTED_LEG_EXTENSIONS"],
        "category": None,
    },
]

# Shortest lap that counts as a full km (auto-laps are 1000 m; the final
# lap of a run is usually only a few metres)
FULL_KM_MIN_M = 950


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


def load_acwr():
    return load_daily_points("training_load", "acwr_ratio")


def load_run_pace():
    """One point per base-HR run: date and pace in seconds per km."""
    rows = get_db().execute(
        "SELECT start_time_local, distance_m, duration_s FROM runs"
        " WHERE run_type = ? ORDER BY start_time_local",
        (BASE_HR_RUN_TYPE,),
    ).fetchall()
    points = []
    for row in rows:
        pace = round(row["duration_s"] / (row["distance_m"] / 1000))
        points.append({"x": row["start_time_local"][:10], "y": pace})
    return points


def load_full_km_laps():
    """Full-km laps per run: {activity_id: [lap, ...]} in lap order."""
    rows = get_db().execute(
        "SELECT activity_id, distance_m, duration_s, avg_hr FROM laps"
        " WHERE distance_m >= ? ORDER BY activity_id, lap_index",
        (FULL_KM_MIN_M,),
    ).fetchall()
    laps_by_run = {}
    for row in rows:
        laps_by_run.setdefault(row["activity_id"], []).append(row)
    return laps_by_run


def efficiency(laps):
    """Speed (m/s) per beat of time-weighted average HR."""
    distance = 0
    duration = 0
    heartbeats = 0
    for lap in laps:
        distance += lap["distance_m"]
        duration += lap["duration_s"]
        heartbeats += lap["avg_hr"] * lap["duration_s"]
    return (distance / duration) / (heartbeats / duration)


def decoupling(laps):
    """Efficiency drop (%) from first to second half, warm-up km skipped."""
    # Odd lap counts drop the middle lap so both halves are whole laps
    measured = laps[1:]
    half = len(measured) // 2
    result = None
    if half > 0:
        first = efficiency(measured[:half])
        second = efficiency(measured[len(measured) - half:])
        result = round((first - second) / first * 100, 1)
    return result


def load_decoupling():
    """One point per base-HR run: date and aerobic decoupling in %."""
    runs = get_db().execute(
        "SELECT activity_id, start_time_local FROM runs"
        " WHERE run_type = ? ORDER BY start_time_local",
        (BASE_HR_RUN_TYPE,),
    ).fetchall()
    laps_by_run = load_full_km_laps()
    points = []
    for run in runs:
        laps = laps_by_run.get(run["activity_id"], [])
        value = decoupling(laps)
        points.append({"x": run["start_time_local"][:10], "y": value})
    return points


def load_metres_per_beat():
    """One point per run with HR: date, metres per heartbeat, run details."""
    rows = get_db().execute(
        "SELECT start_time_local, distance_m, duration_s, avg_hr,"
        " location, run_type, activity_name FROM runs"
        " WHERE avg_hr IS NOT NULL AND distance_m > 0"
        " ORDER BY start_time_local"
    ).fetchall()
    points = []
    for row in rows:
        metres_per_minute = row["distance_m"] / (row["duration_s"] / 60)
        points.append({
            "x": row["start_time_local"][:10],
            "y": round(metres_per_minute / row["avg_hr"], 3),
            "name": row["activity_name"],
            "location": row["location"],
            "type": row["run_type"],
            "pace": round(row["duration_s"] / (row["distance_m"] / 1000)),
            "hr": row["avg_hr"],
        })
    return points


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


def exercise_label(category, name):
    """Chart label of the listed exercise a set belongs to, or None."""
    label = None
    for exercise in STRENGTH_EXERCISES:
        if name in exercise["names"]:
            label = exercise["label"]
        elif name is None and category == exercise["category"]:
            label = exercise["label"]
    return label


def heaviest_sets(rows):
    """{label: {activity_id: (date, heaviest kg)}}, sessions in date order."""
    heaviest = {}
    for row in rows:
        label = exercise_label(row["category"], row["name"])
        if label is None:
            continue
        # No weight = bodyweight = 0 kg added; + 0.0 turns Garmin's -0.0
        # into 0.0
        kg = (row["weight_kg"] or 0) + 0.0
        sessions = heaviest.setdefault(label, {})
        previous = sessions.get(row["activity_id"])
        if previous is None or kg > previous[1]:
            sessions[row["activity_id"]] = (row["start_time_local"][:10], kg)
    return heaviest


def load_strength_progress():
    """Per listed exercise: heaviest set in its first and latest session."""
    rows = get_db().execute(
        "SELECT ss.start_time_local, st.activity_id, st.category, st.name,"
        " st.weight_kg FROM strength_sets st"
        " JOIN strength_sessions ss USING (activity_id)"
        " ORDER BY ss.start_time_local, st.set_index"
    ).fetchall()
    heaviest = heaviest_sets(rows)
    progress = []
    for exercise in STRENGTH_EXERCISES:
        sessions = list(heaviest.get(exercise["label"], {}).values())
        if len(sessions) == 0:
            continue
        progress.append({
            "label": exercise["label"],
            "first": sessions[0][1],
            "first_date": sessions[0][0],
            "latest": sessions[-1][1],
            "latest_date": sessions[-1][0],
        })
    return progress
