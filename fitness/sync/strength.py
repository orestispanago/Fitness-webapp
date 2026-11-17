import json

from fitness.sync.common import (
    format_sync_counts,
    insert_rows,
    load_stored_rows,
    store_by_id,
)

SESSION_COLUMNS = [
    "activity_id",
    "start_time_local",
    "workout_id",
    "session_label",
    "exercise_summary",
]

SET_COLUMNS = [
    "activity_id",
    "set_index",
    "category",
    "name",
    "reps",
    "weight_kg",
]


# strength_sessions


def is_workout_session(activity):
    """A strength activity done from a Garmin Connect workout."""
    type_key = (activity.get("activityType") or {}).get("typeKey")
    matches = False
    if type_key == "strength_training" and activity.get("workoutId"):
        matches = True
    return matches


def format_exercise_summary(activity):
    """Garmin's per-exercise summary as JSON text, compared to detect edits."""
    summary = activity.get("summarizedExerciseSets")
    text = None
    if summary is not None:
        text = json.dumps(summary, sort_keys=True)
    return text


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
                format_exercise_summary(activity),
            )
        )
    return rows


def find_sessions_needing_sets(conn, rows):
    """New sessions and sessions whose exercise summary changed in Garmin."""
    stored = load_stored_rows(
        conn, "strength_sessions", ["activity_id", "exercise_summary"]
    )
    activity_ids = []
    for row in rows:
        activity_id = row[0]
        if activity_id not in stored or stored[activity_id][1] != row[4]:
            activity_ids.append(activity_id)
    return activity_ids


def sync_sessions(conn, rows):
    new_ids, changed_ids, deleted_ids = store_by_id(
        conn, "strength_sessions", SESSION_COLUMNS, rows
    )
    print(
        format_sync_counts(
            "strength_sessions", len(rows), new_ids, changed_ids, deleted_ids
        )
    )


# strength_sets


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


def replace_sets(conn, client, activity_id):
    response = client.get_activity_exercise_sets(activity_id)
    rows = parse_sets(activity_id, response)
    conn.execute("DELETE FROM strength_sets WHERE activity_id = ?", (activity_id,))
    insert_rows(conn, "strength_sets", SET_COLUMNS, rows)
    return len(rows)


def sync_sets(conn, client, activity_ids):
    set_count = 0
    for activity_id in activity_ids:
        set_count += replace_sets(conn, client, activity_id)
    print(f"strength_sets: {set_count} fetched for {len(activity_ids)} sessions")


def sync_all(conn, client, activities):
    rows = parse_sessions(activities)
    # Before storing: the comparison needs the old summaries
    activity_ids = find_sessions_needing_sets(conn, rows)
    sync_sessions(conn, rows)
    sync_sets(conn, client, activity_ids)
