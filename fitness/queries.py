from fitness.db import get_db

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


def load_run_pace():
    """One point per base-HR run: date and pace in seconds per km."""
    rows = get_db().execute(
        "SELECT start_time_local, distance_m, duration_s"
        " FROM base_hr_runs ORDER BY start_time_local"
    ).fetchall()
    points = []
    for row in rows:
        pace = round(row["duration_s"] / (row["distance_m"] / 1000))
        points.append({"x": row["start_time_local"][:10], "y": pace})
    return points


def load_run_hr():
    """One point per base-HR run: date and average heart rate."""
    rows = get_db().execute(
        "SELECT start_time_local, avg_hr"
        " FROM base_hr_runs ORDER BY start_time_local"
    ).fetchall()
    points = []
    for row in rows:
        points.append({"x": row["start_time_local"][:10], "y": row["avg_hr"]})
    return points


def load_pace_fade():
    """Per run: last full km's pace minus first km's, in seconds per km."""
    # Runs end with a short partial lap (a few metres), so only laps of
    # at least FULL_KM_MIN_M count as "km"
    rows = get_db().execute(
        """
        SELECT
            r.start_time_local,
            (SELECT duration_s / distance_m * 1000 FROM laps
             WHERE activity_id = r.activity_id AND distance_m >= :full
             ORDER BY lap_index LIMIT 1) AS first_pace,
            (SELECT duration_s / distance_m * 1000 FROM laps
             WHERE activity_id = r.activity_id AND distance_m >= :full
             ORDER BY lap_index DESC LIMIT 1) AS last_pace
        FROM base_hr_runs r
        ORDER BY r.start_time_local
        """,
        {"full": FULL_KM_MIN_M},
    ).fetchall()
    points = []
    for row in rows:
        fade = None
        if row["first_pace"] is not None and row["last_pace"] is not None:
            fade = round(row["last_pace"] - row["first_pace"])
        points.append({"x": row["start_time_local"][:10], "y": fade})
    return points


def load_sleep_shortfall():
    """Per night: sleep minus sleep need, in minutes (negative = short)."""
    rows = get_db().execute(
        "SELECT calendar_date, sleep_duration_minutes, sleep_need_minutes"
        " FROM sleep ORDER BY calendar_date"
    ).fetchall()
    points = []
    for row in rows:
        shortfall = None
        if row["sleep_duration_minutes"] is not None:
            shortfall = row["sleep_duration_minutes"] - row["sleep_need_minutes"]
        points.append({"x": row["calendar_date"], "y": shortfall})
    return points
