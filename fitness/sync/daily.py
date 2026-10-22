from datetime import date

from fitness.config import FIRST_DATA_DATE
from fitness.sync.common import date_windows, days_in_range

# get_rhr_daily is documented as covering "up to ~1 year" per request
RESTING_HR_MAX_DAYS = 365
# get_hrv_data_range rejects ranges over 366 days with a 400 error
HRV_MAX_DAYS = 365


def daily_start_date(conn, table, value_column):
    """Latest day with a non-null value, or FIRST_DATA_DATE if none."""
    # Not MAX(calendar_date): trailing null rows (e.g. watch not synced
    # yet) must be re-fetched on the next sync. Identifiers are internal
    # constants, never user input.
    row = conn.execute(
        f"SELECT MAX(calendar_date) FROM {table}"
        f" WHERE {value_column} IS NOT NULL"
    ).fetchone()
    start = row[0]
    if start is None:
        start = FIRST_DATA_DATE
    return start


def store_daily(conn, table, columns, rows):
    """Insert-or-update rows keyed on calendar_date (columns exclude it)."""
    # Identifiers are internal constants, never user input.
    updates = []
    for column in columns:
        updates.append(f"{column} = excluded.{column}")
    placeholders = ", ".join(["?"] * (len(columns) + 1))
    conn.executemany(
        f"INSERT INTO {table} (calendar_date, {', '.join(columns)})"
        f" VALUES ({placeholders})"
        f" ON CONFLICT (calendar_date) DO UPDATE SET {', '.join(updates)}",
        rows,
    )


# vo2max


def parse_vo2max(entries):
    rows = []
    for entry in entries:
        generic = entry.get("generic")
        if generic is None:
            continue
        value = generic.get("vo2MaxPreciseValue")
        if value is None:
            continue
        rows.append((generic["calendarDate"], value))
    return rows


def sync_vo2max(conn, client):
    start = daily_start_date(conn, "vo2max", "vo2max_precise_value")
    end = date.today().isoformat()
    entries = client.get_max_metrics_range(start, end)
    rows = parse_vo2max(entries)
    store_daily(conn, "vo2max", ["vo2max_precise_value"], rows)
    print(f"vo2max: {len(rows)} rows stored ({start} to {end})")


# resting_hr


def fetch_resting_hr(client, start, end):
    entries = []
    for window_start, window_end in date_windows(
        start, end, RESTING_HR_MAX_DAYS
    ):
        entries.extend(client.get_rhr_daily(window_start, window_end))
    return entries


def parse_resting_hr(entries):
    rows = []
    for entry in entries:
        value = entry.get("value")
        if value is None:
            continue
        rows.append((entry["calendarDate"], round(value)))
    return rows


def sync_resting_hr(conn, client):
    start = daily_start_date(conn, "resting_hr", "resting_hr_bpm")
    end = date.today().isoformat()
    entries = fetch_resting_hr(client, start, end)
    rows = parse_resting_hr(entries)
    store_daily(conn, "resting_hr", ["resting_hr_bpm"], rows)
    print(f"resting_hr: {len(rows)} rows stored ({start} to {end})")


# hrv


def fetch_hrv(client, start, end):
    summaries = []
    for window_start, window_end in date_windows(start, end, HRV_MAX_DAYS):
        response = client.get_hrv_data_range(window_start, window_end)
        if response is None:
            continue
        summaries.extend(response.get("hrvSummaries") or [])
    return summaries


def parse_hrv(summaries, start, end):
    """One row per day in range; days Garmin didn't return get None."""
    values = {}
    for summary in summaries:
        values[summary["calendarDate"]] = summary.get("lastNightAvg")
    rows = []
    for day in days_in_range(start, end):
        rows.append((day, values.get(day)))
    return rows


def sync_hrv(conn, client):
    start = daily_start_date(conn, "hrv", "hrv_value")
    end = date.today().isoformat()
    summaries = fetch_hrv(client, start, end)
    rows = parse_hrv(summaries, start, end)
    store_daily(conn, "hrv", ["hrv_value"], rows)
    print(f"hrv: {len(rows)} rows stored ({start} to {end})")


# weight


def fetch_weight(client, start, end):
    response = client.get_weight_snapshot(start, end)
    return response.get("dateWeightList") or []


def parse_weight(entries):
    """Latest real weigh-in per day, in kg; profile-setting weights skipped."""
    latest = {}
    for entry in entries:
        if entry.get("sourceType") == "USER_SETTING":
            continue
        grams = entry.get("weight")
        if grams is None:
            continue
        day = entry["calendarDate"]
        timestamp = entry.get("timestampGMT") or 0
        current = latest.get(day)
        if current is not None and current[0] >= timestamp:
            continue
        latest[day] = (timestamp, round(grams / 1000, 2))
    rows = []
    for day in sorted(latest):
        rows.append((day, latest[day][1]))
    return rows


def sync_weight(conn, client):
    start = daily_start_date(conn, "weight", "weight_kg")
    end = date.today().isoformat()
    entries = fetch_weight(client, start, end)
    rows = parse_weight(entries)
    store_daily(conn, "weight", ["weight_kg"], rows)
    print(f"weight: {len(rows)} rows stored ({start} to {end})")


# sleep


def parse_sleep(entries):
    """(date, duration minutes, need minutes) per recorded night."""
    rows = []
    for entry in entries:
        values = entry.get("values") or {}
        need = values.get("sleepNeed")
        if need is None:
            continue
        seconds = values.get("totalSleepTimeInSeconds")
        duration = None
        if seconds is not None:
            duration = round(seconds / 60)
        rows.append((entry["calendarDate"], duration, need))
    return rows


def sync_sleep(conn, client):
    start = daily_start_date(conn, "sleep", "sleep_duration_minutes")
    end = date.today().isoformat()
    # get_sleep_daily splits the range into 28-day requests itself
    entries = client.get_sleep_daily(start, end)
    rows = parse_sleep(entries)
    columns = [
        "sleep_duration_minutes",
        "sleep_need_minutes",
    ]
    store_daily(conn, "sleep", columns, rows)
    print(f"sleep: {len(rows)} rows stored ({start} to {end})")


# training_load


def fetch_training_load(client, start, end):
    response = client.get_weekly_training_status(start, end)
    report_data = response.get("reportData") or {}
    # reportData is keyed by device id; collect every device's daily entries
    entries = []
    for device_entries in report_data.values():
        entries.extend(device_entries or [])
    return entries


def training_load_row(entry):
    """(date, status, acute, chronic, ratio); all None while onboarding."""
    load = entry.get("acuteTrainingLoadDTO") or {}
    status = load.get("acwrStatus")
    row = (entry["calendarDate"], None, None, None, None)
    if status is not None and status != "NONE":
        row = (
            entry["calendarDate"],
            status,
            load.get("dailyTrainingLoadAcute"),
            load.get("dailyTrainingLoadChronic"),
            load.get("dailyAcuteChronicWorkloadRatio"),
        )
    return row


def parse_training_load(entries):
    rows = []
    for entry in entries:
        if entry.get("primaryTrainingDevice") is False:
            continue
        rows.append(training_load_row(entry))
    return rows


def sync_training_load(conn, client):
    start = daily_start_date(conn, "training_load", "acwr_status")
    end = date.today().isoformat()
    entries = fetch_training_load(client, start, end)
    rows = parse_training_load(entries)
    columns = [
        "acwr_status",
        "acute_load",
        "chronic_load",
        "acwr_ratio",
    ]
    store_daily(conn, "training_load", columns, rows)
    print(f"training_load: {len(rows)} rows stored ({start} to {end})")


def sync_all(conn, client):
    sync_vo2max(conn, client)
    sync_resting_hr(conn, client)
    sync_hrv(conn, client)
    sync_weight(conn, client)
    sync_sleep(conn, client)
    sync_training_load(conn, client)
