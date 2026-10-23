from datetime import date

from fitness.sync.common import find_activity_start_date, store_new


# strength_sessions


def fetch_activities(client, start, end):
    # No type filter: strength_training is a sub-type, which the endpoint
    # rejects as a filter
    return client.get_activities_by_date(start, end)


def is_workout_session(activity):
    """A strength activity done from a Garmin Connect workout."""
    type_key = (activity.get("activityType") or {}).get("typeKey")
    matches = False
    if type_key == "strength_training" and activity.get("workoutId"):
        matches = True
    return matches


def parse_sessions(activities):
    rows = []
    for activity in activities:
        if not is_workout_session(activity):
            continue
        rows.append(
            (
                activity["activityId"],
                activity["startTimeLocal"],
                activity["workoutId"],
                activity["activityName"],
            )
        )
    return rows


def sync_sessions(conn, client):
    start = find_activity_start_date(conn, "strength_sessions")
    end = date.today().isoformat()
    activities = fetch_activities(client, start, end)
    rows = parse_sessions(activities)
    columns = [
        "activity_id",
        "start_time_local",
        "workout_id",
        "session_label",
    ]
    new_count = store_new(conn, "strength_sessions", columns, rows)
    print(
        f"strength_sessions: {len(rows)} found, {new_count} new"
        f" ({start} to {end})"
    )


# strength_sets


def find_sessions_without_sets(conn):
    """Sessions whose sets haven't been fetched yet (normally new ones)."""
    rows = conn.execute(
        "SELECT activity_id FROM strength_sessions"
        " WHERE activity_id NOT IN (SELECT activity_id FROM strength_sets)"
        " ORDER BY start_time_local"
    ).fetchall()
    activity_ids = []
    for row in rows:
        activity_ids.append(row[0])
    return activity_ids


def build_set_row(activity_id, set_index, exercise_set):
    exercise = exercise_set["exercises"][0]
    # Grams -> kg; None when Garmin sent no weight (bodyweight sets)
    weight_kg = None
    if exercise_set.get("weight") is not None:
        weight_kg = round(exercise_set["weight"] / 1000, 2)
    return (
        activity_id,
        set_index,
        exercise["category"],
        exercise.get("name"),
        exercise_set["repetitionCount"],
        weight_kg,
    )


def parse_sets(activity_id, response):
    """ACTIVE sets only, numbered 0, 1, ... in order."""
    rows = []
    for exercise_set in response.get("exerciseSets") or []:
        if exercise_set.get("setType") != "ACTIVE":
            continue
        rows.append(build_set_row(activity_id, len(rows), exercise_set))
    return rows


def sync_sets(conn, client):
    # Sets don't change after a session, so each session's are fetched once
    activity_ids = find_sessions_without_sets(conn)
    columns = [
        "activity_id",
        "set_index",
        "category",
        "name",
        "reps",
        "weight_kg",
    ]
    new_count = 0
    for activity_id in activity_ids:
        response = client.get_activity_exercise_sets(activity_id)
        rows = parse_sets(activity_id, response)
        new_count += store_new(conn, "strength_sets", columns, rows)
    print(f"strength_sets: {new_count} new for {len(activity_ids)} sessions")


def sync_all(conn, client):
    sync_sessions(conn, client)
    sync_sets(conn, client)
