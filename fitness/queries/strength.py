from fitness.db import get_db

# Exercises on the strength bar chart, in chart order: label and Garmin
# exercise name (names are kept consistent in Garmin itself, see SPEC.md)
STRENGTH_EXERCISES = [
    {"label": "Squat (S1)", "name": "BARBELL_BACK_SQUAT"},
    {"label": "Bench press (S2)", "name": "BARBELL_BENCH_PRESS"},
    {"label": "Pull-up (S3)", "name": "WEIGHTED_PULL_UP"},
    {"label": "Lateral raise (S4)", "name": "DUMBBELL_LATERAL_RAISE"},
    {"label": "Romanian deadlift (S2)", "name": "ROMANIAN_DEADLIFT"},
    {"label": "Seated cable row (S4)", "name": "SEATED_CABLE_ROW"},
    {
        "label": "Wide-grip cable row (S1)",
        "name": "WIDE_GRIP_SEATED_CABLE_ROW",
    },
    {"label": "Leg curl (S3)", "name": "WEIGHTED_LEG_CURL"},
    {"label": "Leg extension (S3)", "name": "WEIGHTED_LEG_EXTENSIONS"},
]


def set_kg(weight_kg):
    # No weight = bodyweight = 0 kg added; + 0.0 turns Garmin's -0.0 into 0.0
    return (weight_kg or 0) + 0.0


def load_strength_sets():
    """Every stored set with its session, in session then set order."""
    return get_db().execute(
        "SELECT ss.session_label, ss.start_time_local, st.activity_id,"
        " st.name, st.weight_kg FROM strength_sets st"
        " JOIN strength_sessions ss USING (activity_id)"
        " ORDER BY ss.start_time_local, st.set_index"
    ).fetchall()


def session_weights(rows):
    """{name: {activity_id: (date, [kg, ...])}}, in first-appearance order."""
    weights = {}
    for row in rows:
        sessions = weights.setdefault(row["name"], {})
        day = row["start_time_local"][:10]
        session = sessions.setdefault(row["activity_id"], (day, []))
        session[1].append(set_kg(row["weight_kg"]))
    return weights


def load_strength_progress():
    """Per listed exercise: heaviest set in its first and latest session."""
    weights = session_weights(load_strength_sets())
    progress = []
    for exercise in STRENGTH_EXERCISES:
        sessions = list(weights.get(exercise["name"], {}).values())
        if len(sessions) == 0:
            continue
        first_day, first_kgs = sessions[0]
        latest_day, latest_kgs = sessions[-1]
        progress.append({
            "label": exercise["label"],
            "first": max(first_kgs),
            "first_date": first_day,
            "latest": max(latest_kgs),
            "latest_date": latest_day,
        })
    return progress


def exercise_display_name(name):
    """'EZ_BAR_PREACHER_CURL' -> 'Ez bar preacher curl'."""
    label = "Unnamed exercise"
    if name is not None:
        label = name.replace("_", " ").capitalize()
    return label


def trend_points(sessions):
    """Per session: date, lightest, average and heaviest set, set count."""
    points = []
    for day, kgs in sessions.values():
        points.append({
            "x": day,
            "min": min(kgs),
            "avg": round(sum(kgs) / len(kgs), 1),
            "max": max(kgs),
            "n": len(kgs),
        })
    return points


def exercise_trends(rows):
    """Every exercise in these sets, in first-appearance order, with points."""
    trends = []
    for name, sessions in session_weights(rows).items():
        trends.append({
            "label": exercise_display_name(name),
            "points": trend_points(sessions),
        })
    return trends


def load_exercise_trends():
    """Per session group, sorted by label: its exercises' trends."""
    rows_by_group = {}
    for row in load_strength_sets():
        rows_by_group.setdefault(row["session_label"], []).append(row)
    groups = []
    for label in sorted(rows_by_group):
        exercises = exercise_trends(rows_by_group[label])
        groups.append({"label": label, "exercises": exercises})
    return groups
