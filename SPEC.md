# Fitness webapp — spec

Personal, single-user Flask app with a SQLite-backed database and trend
charts, built incrementally, one vertical slice at a time.

## Pages

- `/fitness` — conditioning (VO2max, resting HR, HRV), weight, sleep
  duration vs. sleep need, ACWR status flag.
- `/running` — base-HR runs only: duration, pace, pace fade (last km minus
  first km), heart rate, pace-vs-HR by location.
- `/strength` — overview + per-session-group trend charts (e.g. S1 Squats,
  S2 Chest, S3 Pull-ups, S4 Shoulders).

All three pages show full history only — no date range picker.

## Out of scope

- Diet / nutrition — no `estimate_nutrition.py` equivalent, no diet report.
- Weather data — dropped entirely. No page uses it, and refresh does not
  fetch it.
- Non-base-HR runs (recovery, threshold, unlabeled) and non-running /
  non-strength activities (hiking, swimming, rucking, etc.) — never
  stored.
- Strength activities whose `workoutId` isn't in the `workout_sessions`
  lookup table — silently skipped, not an error.
- Chart zoom/pan — hover tooltips only.
- Database migrations / ORM — `fitness/schema.sql` is a one-time,
  idempotent initializer; schema changes are hand-edited directly in that
  file.
- LAN access — localhost-only for now, LAN is a later phase.

## Tech stack

- Backend: Flask, server-rendered Jinja2 templates, minimal vanilla JS.
- Charts: Chart.js via CDN, hover tooltips only, no zoom/pan. Date axes
  use Chart.js's `time` scale (with `chartjs-adapter-date-fns`, also via
  CDN) so sparse series are spaced by real dates, not evenly.
- Storage: SQLite (`fitness.db` at the project root, gitignored),
  accessed via raw SQL (stdlib `sqlite3`) — no ORM.
- Styling: bare-bones HTML/CSS, in `fitness/static/style.css`.

## Data source

Garmin Connect, via the `garminconnect` Python library, with its own
authenticated session and token cache (own token path, not
`~/.garminconnect`).

## Refresh behavior

- Eventually, a refresh button will re-run the Garmin fetch only (weather
  is out of scope entirely) and reload from SQLite. Deferred for now —
  see "Build order" below — `python -m fitness.sync` is run manually from the terminal
  until there are enough tables built to justify wiring up the button.
- On failure, the plan is to show an error banner and keep displaying the
  last-good data already in the database — no partial/corrupt overwrite.
  The exact mechanism (e.g. Flask flash messages) isn't decided yet —
  moot until the button itself is built.
- Open decision, deferred until the app is finalized: whether DB setup
  stays a separate `init_db` command or becomes automatic (e.g. a shared
  `ensure_schema()` called by both the sync CLI and the app). Note that
  idempotent `CREATE TABLE IF NOT EXISTS` never alters an existing table
  either way, and `workout_sessions` is hand-entered data that a rebuild
  of `fitness.db` would lose — consider a seed file before the strength
  slice.
- Open decision, deferred: whether to show "current status" summaries
  (e.g. the latest ACWR status and ratio as a text flag above the chart).
  Tried and removed for now; the data is already in `training_load`.

## Database schema

11 tables, SQLite, defined in `schema.sql`. Foreign keys are declared and
enforced (`PRAGMA foreign_keys = ON`, which must be re-issued on every
connection — SQLite doesn't persist it in the database file). No indexes
beyond primary keys.

Start date: every table's first sync (empty table) starts at
`FIRST_DATA_DATE` in `config.py`, currently `2026-06-28` — the first day
of real watch data. Garmin also holds one stray day, `2026-05-08` (a
rucking activity plus that day's wellness summary, recorded by the same
watch, most likely with a wrong clock before first sync), which would
otherwise show up as a bogus early point on every chart. Changing the
date only affects empty tables; delete `fitness.db`, re-run `init_db`
and `sync` to apply it to existing data.

`ON DELETE CASCADE` is used on the two parent → child relationships
(`laps` → `base_hr_runs`, `strength_sets` → `strength_sessions`), where
children are meaningless without their parent. It is deliberately **not**
used on `strength_sessions` → `workout_sessions`: that lookup table is
hand-edited, and a cascade there would let one accidental delete (or an
`INSERT OR REPLACE`) silently wipe a workout's whole history — which a
re-sync would not restore beyond the 30-day floor. With the default
(`NO ACTION`), deleting a lookup row that sessions still reference fails;
removing a workout for real means deleting its sessions first (their sets
cascade), then the lookup row. Fix labels with `UPDATE`, never REPLACE.

### Fitness page (6 tables)

Shared refresh policy (all six daily tables, via `daily_start_date` in
`sync/daily.py`): `start` = the latest `calendar_date` whose value column is
not null, or `FIRST_DATA_DATE` if there is none; `end = today`; rows are
stored keyed on `calendar_date` (existing days overwritten). The start day is re-fetched (inclusive overlap — the
last known day may still be partial).

Why "latest day with a value" rather than `MAX(calendar_date)`: dense
tables store a row for every day, with nulls where Garmin has no data
yet. Using `MAX(calendar_date)`, null rows written before the watch had
synced would push the high-water mark past those days and they'd never
be re-fetched. For sparse tables (value NOT NULL) the two are identical,
so one rule covers both. Cost: trailing null days are re-fetched on
every sync — normally zero or one day.

Value column per table: `vo2max_precise_value`, `resting_hr_bpm`,
`hrv_value`, `weight_kg`, `sleep_duration_minutes` (`sleep_need_minutes`
is always present, so it can't signal missing data), `acwr_status`
(not `acwr_ratio`: Garmin sometimes reports a status without a ratio).

Dense tables: `hrv`'s API omits days without data, so the sync fills them
in itself (`days_in_range` in `sync/common.py`); `training_load`'s API already
returns every day. Nulls render as gaps in the line charts.

| Table | Columns | Shape | Fetch |
|---|---|---|---|
| `vo2max` | `calendar_date` (PK), `vo2max_precise_value` (NOT NULL) | Sparse — only days Garmin computed a value | `get_max_metrics_range` (whole range in one request; list of entries, value at `generic.vo2MaxPreciseValue`, entries with null `generic` or value skipped) |
| `resting_hr` | `calendar_date` (PK), `resting_hr_bpm` (NOT NULL) | Sparse — days without a reading are absent | `get_rhr_daily` (list of `{calendarDate, value}`; value is a float, rounded to int). The library documents a ~1-year limit per request, so the range is fetched in ≤365-day windows (`date_windows` in `sync/common.py`) — one request today; more only once a bootstrap spans over a year |
| `hrv` | `calendar_date` (PK), `hrv_value` (nullable) | Dense — one row per day in range; null if no overnight reading | `get_hrv_data_range` → `hrvSummaries[i].lastNightAvg` (ms); missing days filled with null. The API rejects ranges over 366 days (400 error), so fetched in ≤365-day windows. `weeklyAvg`, `baseline` and `status` are not stored |
| `weight` | `calendar_date` (PK), `weight_kg` (NOT NULL) | Sparse — weigh-in days only; the chart line connects weigh-ins | `get_weight_snapshot` → `dateWeightList` (whole range in one request, no limit observed). `weight` is in grams → kg (2 dp). `sourceType == "USER_SETTING"` entries (the weight from Garmin profile settings, not a weigh-in) are skipped. Several weigh-ins on one day → latest by `timestampGMT` |
| `sleep` | `calendar_date` (PK), `sleep_duration_minutes` (nullable), `sleep_need_minutes` (NOT NULL) | Sparse — recorded nights only (a missed night has no entry at all, so there's no need value to store; the chart line connects across it). Duration stays nullable in case Garmin sends a night with a need but no duration; none so far | `get_sleep_daily` → `values.totalSleepTimeInSeconds` (→ minutes, rounded) and `values.sleepNeed` (already minutes); entries without `sleepNeed` skipped. The library splits ranges into 28-day requests itself. Charted as two lines (sleep, dashed sleep need) in hours, converted in `queries.load_sleep`; the tooltip shows both values for the hovered night, formatted `7h 16m` (`formatHours` in `fitness.js`) |
| `training_load` | `calendar_date` (PK), `acwr_status`, `acute_load`, `chronic_load`, `acwr_ratio` (all nullable) | Dense — the API returns every day; all four columns nulled together when `acwrStatus == "NONE"` (onboarding, 06-28 to 07-03). `acwr_ratio` can also be null on days that do have a status (07-04 to 07-10); stored as Garmin reports it, not recomputed (Garmin's ratio isn't a plain acute/chronic division) | `get_weekly_training_status` → `reportData[<deviceId>][i].acuteTrainingLoadDTO`: `acwrStatus`, `dailyTrainingLoadAcute`, `dailyTrainingLoadChronic`, `dailyAcuteChronicWorkloadRatio`. Whole range in one request, no limit observed. Entries with `primaryTrainingDevice == false` skipped. Page: a `dailyLineChart` of the ratio, with shaded status bands behind it (LOW < 0.8, OPTIMAL 0.8–1.5, HIGH ≥ 1.5; `ACWR_BANDS` in `fitness.js`). The cut-offs are inferred from the data — every stored status matches them — not from Garmin documentation; a VERY HIGH status (sports-science literature uses > 2.0) has never been observed, so it has no band yet. The y-axis uses `suggestedMax: 1.7` so the HIGH band is always visible |

### Running page (2 tables)

| Table | Columns | Notes |
|---|---|---|
| `base_hr_runs` | `activity_id` (PK), `start_time_local`, `distance_m`, `duration_s`, `avg_hr` (NOT NULL), `location` (nullable), `activity_name` (NOT NULL) | Only rows where `activityType == "running"` and the activity name contains `Base-HR` (the run-type marker). Names follow `<Location> - Base-HR` (e.g. `Jeddah - Base-HR`); `location` is the part before ` - `, null if the name has no ` - `. Fetch: `get_activities_by_date`. Refresh: start at `FIRST_DATA_DATE` if empty, else same calendar day as `MAX(start_time_local)` (not +1 day, to avoid missing a second same-day activity a prior refresh only partially caught); insert-if-not-exists by `activity_id`. |
| `laps` | `activity_id` (FK → `base_hr_runs`, `ON DELETE CASCADE`), `lap_index`, `distance_m`, `duration_s`, `avg_hr` (all NOT NULL); PK `(activity_id, lap_index)` | Fetched once per activity via `get_activity_splits` (`lapDTOs` only, `eventDTOs` dropped). Inserted once when the run is first stored — no refresh-overlap, laps don't change after the fact. |

### Strength page (3 tables)

| Table | Columns | Notes |
|---|---|---|
| `workout_sessions` | `workout_id` (PK, from Garmin), `session_label` (NOT NULL) | Manually maintained lookup table — add a row whenever a new workout generation is created on Garmin Connect. |
| `strength_sessions` | `activity_id` (PK), `start_time_local` (NOT NULL), `workout_id` (NOT NULL, FK → `workout_sessions`, no cascade — see above) | Only inserted if `workout_id` already exists in `workout_sessions`; unrecognized workouts are silently skipped. Refresh: start at `FIRST_DATA_DATE` if empty, else `start = MIN(same calendar day as MAX(start_time_local), today - 30 days)` — the 30-day floor re-scans recent history on every refresh so a session skipped for an unregistered `workout_id` still gets picked up once that workout is registered, instead of being permanently missed once a later recognized session advances the high-water mark past it. (`base_hr_runs` has no lookup-table gate, so it doesn't need this floor — plain same-day overlap is enough there.) |
| `strength_sets` | `activity_id` (FK → `strength_sessions`, `ON DELETE CASCADE`), `set_index` (0-based, ACTIVE sets only), `category`, `name`, `reps` (all NOT NULL), `weight_kg` (nullable — bodyweight exercises, e.g. pull-ups, have no added load); PK `(activity_id, set_index)` | Fetched once per activity via `get_activity_exercise_sets`, filtered to `setType == "ACTIVE"`, taking `exercises[0]`. Inserted once, no refresh-overlap. Whether a null `weight_kg` renders as 0, a gap, or is excluded is a chart-layer decision, not a schema one. |

## Code structure

Layout: a single `fitness/` package holds all code, `schema.sql`,
`templates/` and `static/`. The project root keeps only docs
(`SPEC.md`, `CLAUDE.md`), `requirements.txt`, and gitignored local state
(`.env`, `.token/`, `fitness.db`, `.venv/`). No `src/` layout and no
`pyproject.toml` — the app isn't installed or distributed. Modules use
absolute imports (`from fitness.config import DB_PATH`) and are run from
the project root: `python -m fitness.init_db`, `python -m fitness.sync`,
`flask --app fitness.app run`. Split into subpackages only if one side
grows enough to warrant it — so far only `sync/` (see below).

All paths below are inside `fitness/`.

- `app.py` — Flask routes only. Flat, no application factory, no
  blueprints (not worth the overhead for 3 static pages with no auth and
  no test suite). Page route functions are named `<page>_page`
  (`fitness_page`, `running_page`, `strength_page`); that name is also
  the `url_for` endpoint.
- `db.py` — per-request SQLite connection via `flask.g` and
  `app.teardown_appcontext`, following Flask's own documented pattern.
- `queries.py` — read-only SQL for the pages: one named function per
  chart (`load_vo2max`, …), returning plain Python data ready for
  `| tojson`. Daily series share `load_daily_points(table, value_column)`
  ({x: date, y: value} points, nulls kept); the named wrappers keep
  table/column names out of the routes. No SQL in `app.py`.
- `init_db.py` — separate setup command that applies `schema.sql`.
  Run once, and again after editing the schema. `sync/` and `db.py`
  open the DB in `mode=rw`, so they fail loudly instead of silently
  creating an empty `fitness.db` if setup hasn't been run.
- `garmin_client.py` — Garmin Connect auth, with its own token cache (not
  `~/.garminconnect`).
- `sync/` — fetch/transform/store logic for every table, one module
  per page:
  - `__init__.py` — `main()`: log in, open the DB, run each page's
    `sync_all(conn, client)`, commit once at the end (any failure rolls
    back the whole run). `__main__.py` just calls it, so the command is
    still `python -m fitness.sync`.
  - `common.py` — `open_connection`, `date_windows`, `days_in_range`.
  - `daily.py` — the six fitness-page tables, `daily_start_date`, and
    the per-endpoint range limits (`RESTING_HR_MAX_DAYS`,
    `HRV_MAX_DAYS`).
  - `running.py`, `strength.py` — to come with their slices.

  Fully self-contained: opens its own connection, commits, and closes it
  on every run, independent of Flask's per-request connection in `db.py`.
  `main()` is runnable both as a CLI and importable for the eventual
  `/refresh` route (`from fitness.sync import main`) — the same function serves as both a
  standalone script entry point and a Flask route handler. No CLI
  arguments for now; add an `argv` parameter only if options are needed.
  - Internal organization: one `sync_<table>` function per table with
    its own fetch/parse/store steps. Shared helpers are only introduced
    once duplication is visible across 2–3 real tables, not guessed at
    upfront. Extracted so far: in `daily.py`, `daily_start_date`
    (refresh start for daily tables) and `store_daily(conn, table,
    columns, rows)` (writes daily rows); in `common.py`, `date_windows`
    (split long ranges for endpoints with a per-request limit) and
    `days_in_range` (fill dense tables). Fetch and parse stay per-table —
    they differ in endpoint and response shape — and so does each
    `sync_<table>`, which shows that table's specifics.
  - Storing: daily rows are written as insert-or-update
    (`INSERT ... ON CONFLICT (calendar_date) DO UPDATE`, a.k.a. "upsert")
    by `store_daily` — new days are added, existing days overwritten.
    Never `INSERT OR REPLACE` (it deletes first, which can fire
    cascades). Activity tables, which only add rows that don't exist
    yet, will use `store_new_<table>` (`INSERT OR IGNORE`).
- Templates: `base.html` holds the shared skeleton (doctype, head, the
  stylesheet link, the Chart.js CDN scripts, nav between the pages)
  with a `{% block content %}`; one template per page (`fitness.html`,
  `running.html`, `strength.html`) extends it. Templates contain no
  inline JS or CSS.
- Static files: `static/style.css` holds all styling. One JS file per
  page (`static/fitness.js`, `static/running.js`, `static/strength.js`),
  loaded at the end of that page's template. `fitness.js` defines
  `dailyScales(yTitle)` (real-date x-axis, titled y-axis) and
  `dailyLineChart(canvasId, label, yTitle)` for single-series daily
  line charts (nulls as gaps). All daily charts use
  `interaction: { mode: "index", intersect: false }`, so hovering
  anywhere shows the tooltip for the nearest date; charts that don't fit it (e.g. sleep's two
  lines, read from `data-duration` / `data-need`) get their own
  `new Chart(...)` reusing `dailyScales`. `dailyLineChart` takes optional Chart.js plugins; `bandsPlugin(bands)` shades labelled horizontal ranges behind the data (used for the ACWR status zones). Helpers stay per page until another page needs the
  same one — same "wait for real duplication" principle as `sync/`.
- Chart data flow: a route calls `queries.py`, which returns a plain
  Python data structure; the route passes it into the template context,
  and the template puts it on the chart's `<canvas>` as a single-quoted
  `data-points='{{ ... | tojson }}'` attribute (Flask documents `tojson`
  as safe there). The page's JS file reads it with
  `JSON.parse(canvas.dataset.points)`. No Jinja inside `<script>`, so
  editors and formatters treat templates as plain HTML without breaking
  them. No JSON API endpoint, no client-side `fetch()` — nothing in this
  app needs data without a full page reload.
- Testing: no automated test suite for now — manual verification (run
  the app, check the chart in a browser) is proportionate for a
  personal, single-user tool. Worth revisiting specifically for
  `sync/`'s refresh-window date math (bootstrap/overlap/30-day-floor)
  if that logic becomes a concern again — it's already needed
  correction twice during design, and a bug there wouldn't be visually
  obvious on a chart.

## Build order

- Built as vertical slices, one table at a time: fetch → insert → plot,
  fully working end to end before moving to the next table. Not building
  broadly across all 11 tables or all 3 pages at once.
- First slice: `vo2max` — the simplest table (one API call, one value
  column, a single insert-or-update, a plain line chart), chosen specifically to
  prove the whole pipeline (auth, `db.py`, insert, route, chart) with
  minimal complexity before adding anything else.
- The refresh button is deferred (see "Refresh behavior" above) — run
  `python -m fitness.sync` manually from the terminal while slices are
  being built.
- No ORM, no migration tooling — `schema.sql` is hand-edited directly as
  the schema evolves.
- Status: all six fitness-page slices done (`vo2max`, `resting_hr`,
  `hrv`, `weight`, `sleep`, `training_load`); sync code split into the
  `sync/` package. Next slice not yet chosen. The nav in
  `base.html` only links pages that exist; it grows as pages are added.
