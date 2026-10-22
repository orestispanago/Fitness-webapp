from fitness.db import get_db


def load_vo2max():
    rows = get_db().execute(
        "SELECT calendar_date, vo2max_precise_value"
        " FROM vo2max ORDER BY calendar_date"
    ).fetchall()
    points = []
    for row in rows:
        point = {"x": row["calendar_date"], "y": row["vo2max_precise_value"]}
        points.append(point)
    return points
