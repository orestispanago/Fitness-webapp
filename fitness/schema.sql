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
    hrv_value INTEGER
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

CREATE TABLE IF NOT EXISTS base_hr_runs (
    activity_id INTEGER PRIMARY KEY,
    start_time_local TEXT NOT NULL,
    distance_m REAL NOT NULL,
    duration_s REAL NOT NULL,
    avg_hr INTEGER NOT NULL,
    location TEXT,
    activity_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS laps (
    activity_id INTEGER NOT NULL REFERENCES base_hr_runs (activity_id) ON DELETE CASCADE,
    lap_index INTEGER NOT NULL,
    distance_m REAL NOT NULL,
    duration_s REAL NOT NULL,
    avg_hr INTEGER NOT NULL,
    PRIMARY KEY (activity_id, lap_index)
);

-- Strength page

CREATE TABLE IF NOT EXISTS workout_sessions (
    workout_id INTEGER PRIMARY KEY,
    session_label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS strength_sessions (
    activity_id INTEGER PRIMARY KEY,
    start_time_local TEXT NOT NULL,
    workout_id INTEGER NOT NULL REFERENCES workout_sessions (workout_id)
);

CREATE TABLE IF NOT EXISTS strength_sets (
    activity_id INTEGER NOT NULL REFERENCES strength_sessions (activity_id) ON DELETE CASCADE,
    set_index INTEGER NOT NULL,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    reps INTEGER NOT NULL,
    weight_kg REAL,
    PRIMARY KEY (activity_id, set_index)
);
