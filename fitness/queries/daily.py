from statistics import linear_regression

import pandas as pd

from fitness.db import get_db


def load_daily_points(table, value_column):
    """{x: date, y: value} points for a daily table, oldest first."""
    # Identifiers are internal constants, never user input.
    rows = (
        get_db()
        .execute(
            f"SELECT calendar_date, {value_column} AS value"
            f" FROM {table} ORDER BY calendar_date"
        )
        .fetchall()
    )
    points = []
    for row in rows:
        point = {"x": row["calendar_date"], "y": row["value"]}
        points.append(point)
    return points


def calc_7day_rolling_mean(points):
    if not points:
        return []
    df = pd.DataFrame(points)[["x", "y"]]
    dates = pd.to_datetime(df["x"]).rename("date")
    df = df.set_index(dates)
    values = df["y"].astype(float)  # nulls -> NaN, skipped by the mean
    df["y"] = values.rolling("7D").mean().round(2)
    # NaN -> None for tojson; a float column can't hold None
    df = df.astype(object)
    df = df.where(df.notna(), None)
    return df.to_dict("records")


def calc_weight_change_per_month(points):
    """kg/month over the last 30 calendar days"""
    if not points:
        return None
    df = pd.DataFrame(points)
    df["x"] = pd.to_datetime(df["x"])
    df_last_30 = df[df["x"] > df["x"].max() - pd.Timedelta(days=30)]
    if len(df_last_30) < 2:
        return None
    days = df_last_30["x"].map(pd.Timestamp.toordinal)
    return linear_regression(days, df_last_30["y"]).slope * 30


def load_vo2max():
    return load_daily_points("vo2max", "vo2max_precise_value")


def load_resting_hr():
    return load_daily_points("resting_hr", "resting_hr_bpm")


def load_hrv():
    return load_daily_points("hrv", "hrv_value")


def load_hrv_baseline():
    """Per day: Garmin's HRV status and baseline limits (nulls kept)."""
    rows = (
        get_db()
        .execute(
            "SELECT calendar_date, hrv_status, baseline_low_upper,"
            " baseline_balanced_low, baseline_balanced_upper"
            " FROM hrv ORDER BY calendar_date"
        )
        .fetchall()
    )
    days = []
    for row in rows:
        days.append(
            {
                "x": row["calendar_date"],
                "status": row["hrv_status"],
                "low_upper": row["baseline_low_upper"],
                "balanced_low": row["baseline_balanced_low"],
                "balanced_upper": row["baseline_balanced_upper"],
            }
        )
    return days


def load_weight():
    return load_daily_points("weight", "weight_kg")


def load_sleep_shortfall():
    """Per night: sleep minus need in minutes (negative = short), and sleep."""
    rows = (
        get_db()
        .execute(
            "SELECT calendar_date, sleep_duration_minutes, sleep_need_minutes"
            " FROM sleep ORDER BY calendar_date"
        )
        .fetchall()
    )
    points = []
    for row in rows:
        shortfall = None
        if row["sleep_duration_minutes"] is not None:
            shortfall = (
                row["sleep_duration_minutes"] - row["sleep_need_minutes"]
            )
        points.append(
            {
                "x": row["calendar_date"],
                "y": shortfall,
                "slept": row["sleep_duration_minutes"],
            }
        )
    return points


def load_acwr():
    return load_daily_points("training_load", "acwr_ratio")
