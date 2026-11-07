from fitness.db import get_db
from fitness.queries.common import get_date_part


def normalize_added_kg(weight_kg):
    # No weight or Garmin's -0.0 (bodyweight) = 0 kg added; Garmin has no
    # negative (assisted) weights, so abs only affects -0.0
    return abs(weight_kg or 0.0)


def load_strength_sets():
    """Every stored set with its session, in session then set order."""
    return get_db().execute(
        "SELECT ss.session_label, ss.start_time_local, st.activity_id,"
        " st.name, st.weight_kg FROM strength_sets st"
        " JOIN strength_sessions ss USING (activity_id)"
        " ORDER BY ss.start_time_local, st.set_index"
    ).fetchall()


def group_set_weights(rows):
    """{name: {activity_id: {date, kgs}}}, in first-appearance order."""
    weights = {}
    for row in rows:
        sessions = weights.setdefault(row["name"], {})
        day = get_date_part(row["start_time_local"])
        session = sessions.setdefault(
            row["activity_id"], {"date": day, "kgs": []}
        )
        session["kgs"].append(normalize_added_kg(row["weight_kg"]))
    return weights


def list_session_labels(rows):
    """Session groups in these sets, sorted by label (the page's order)."""
    labels = []
    for row in rows:
        if row["session_label"] not in labels:
            labels.append(row["session_label"])
    return sorted(labels)


def format_exercise_name(name):
    """'EZ_BAR_PREACHER_CURL' -> 'Ez bar preacher curl'."""
    label = "Unnamed exercise"
    if name is not None:
        label = name.replace("_", " ").capitalize()
    return label


def build_trend_points(sessions):
    """Per session: date, lightest, average and heaviest set, set count."""
    points = []
    for session in sessions.values():
        kgs = session["kgs"]
        points.append({
            "x": session["date"],
            "min": min(kgs),
            "avg": round(sum(kgs) / len(kgs), 1),
            "max": max(kgs),
            "sets": len(kgs),
        })
    return points


def build_exercise_trends(rows):
    """Every exercise in these sets, in first-appearance order, with points."""
    trends = []
    for name, sessions in group_set_weights(rows).items():
        trends.append({
            "label": format_exercise_name(name),
            "points": build_trend_points(sessions),
        })
    return trends


def filter_group_rows(rows, label):
    group_rows = []
    for row in rows:
        if row["session_label"] == label:
            group_rows.append(row)
    return group_rows


def find_latest_label(rows):
    """Group of the latest session (rows are in session order)."""
    label = None
    if rows:
        label = rows[-1]["session_label"]
    return label


def choose_group(rows, labels, requested_label):
    """The requested group if it exists, else the default (see SPEC.md)."""
    label = requested_label
    if label not in labels:
        label = find_latest_label(rows)
    return label
