from fitness.config import BASE_HR_RUN_TYPE
from fitness.db import get_db
from fitness.queries.common import get_date_part


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
        points.append({"x": get_date_part(row["start_time_local"]), "y": pace})
    return points


def load_metres_per_beat():
    """One point per run with HR: date, metres per heartbeat, run details."""
    rows = get_db().execute(
        "SELECT start_time_local, distance_m, duration_s, avg_hr,"
        " location, run_type, activity_name,"
        " temp_c, apparent_temp_c, relative_humidity FROM runs"
        " WHERE avg_hr IS NOT NULL AND distance_m > 0"
        " ORDER BY start_time_local"
    ).fetchall()
    points = []
    for row in rows:
        metres_per_minute = row["distance_m"] / (row["duration_s"] / 60)
        points.append({
            "x": get_date_part(row["start_time_local"]),
            "y": round(metres_per_minute / row["avg_hr"], 3),
            "name": row["activity_name"],
            "location": row["location"],
            "type": row["run_type"],
            "pace": round(row["duration_s"] / (row["distance_m"] / 1000)),
            "hr": row["avg_hr"],
            "temp": row["temp_c"],
            "feels": row["apparent_temp_c"],
            "humidity": row["relative_humidity"],
        })
    return points
