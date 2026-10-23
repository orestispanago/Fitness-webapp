from fitness.config import BASE_HR_RUN_TYPE
from fitness.db import get_db

# Shortest lap that counts as a full km (auto-laps are 1000 m; the final
# lap of a run is usually only a few metres)
FULL_KM_MIN_M = 950


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
