-- Fitness webapp schema (SQLite). See SPEC.md for design rationale,
-- refresh policies, and data-source details.

PRAGMA foreign_keys = ON;

-- Fitness page

CREATE TABLE IF NOT EXISTS vo2max (
    calendar_date TEXT NOT NULL PRIMARY KEY,
    vo2max_precise_value REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS resting_hr (
    calendar_date TEXT NOT NULL PRIMARY KEY,
    resting_hr_bpm INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS hrv (
    calendar_date TEXT NOT NULL PRIMARY KEY,
    hrv_value INTEGER,
    hrv_status TEXT,
    baseline_low_upper INTEGER,
    baseline_balanced_low INTEGER,
    baseline_balanced_upper INTEGER
);

CREATE TABLE IF NOT EXISTS weight (
    calendar_date TEXT NOT NULL PRIMARY KEY,
    weight_kg REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS sleep (
    calendar_date TEXT NOT NULL PRIMARY KEY,
    sleep_duration_minutes INTEGER,
    sleep_need_minutes INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS training_load (
    calendar_date TEXT NOT NULL PRIMARY KEY,
    acwr_status TEXT,
    acute_load INTEGER,
    chronic_load INTEGER,
    acwr_ratio REAL
);

-- Running page

CREATE TABLE IF NOT EXISTS runs (
    activity_id INTEGER PRIMARY KEY,
    start_time_local TEXT NOT NULL,
    distance_m REAL NOT NULL,
    duration_s REAL NOT NULL,
    avg_hr INTEGER,
    location TEXT,
    run_type TEXT,
    activity_name TEXT NOT NULL
);

-- Strength page

CREATE TABLE IF NOT EXISTS strength_sessions (
    activity_id INTEGER PRIMARY KEY,
    start_time_local TEXT NOT NULL,
    workout_id INTEGER NOT NULL,
    session_label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS strength_sets (
    activity_id INTEGER NOT NULL REFERENCES strength_sessions (activity_id) ON DELETE CASCADE,
    set_index INTEGER NOT NULL,
    category TEXT NOT NULL,
    name TEXT,
    reps INTEGER NOT NULL,
    weight_kg REAL,
    PRIMARY KEY (activity_id, set_index)
);
