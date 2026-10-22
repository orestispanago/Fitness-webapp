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
  see "Build order" below — `sync.py` is run manually from the terminal
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

## Database schema

11 tables, SQLite, defined in `schema.sql`. Foreign keys are declared and
enforced (`PRAGMA foreign_keys = ON`, which must be re-issued on every
connection — SQLite doesn't persist it in the database file). No indexes
beyond primary keys.

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

Shared refresh policy: bootstrap `start = '2000-01-01'` if the table is
empty, else `start = MAX(calendar_date)` (inclusive overlap — the last
known day may still be partial); `end = today`; upsert on `calendar_date`.

| Table | Columns | Shape | Fetch |
|---|---|---|---|
| `vo2max` | `calendar_date` (PK), `vo2max_precise_value` (NOT NULL) | Sparse — only days Garmin computed a value | `get_max_metrics_range` (whole range in one request; list of entries, value at `generic.vo2MaxPreciseValue`, entries with null `generic` or value skipped) |
| `resting_hr` | `calendar_date` (PK), `resting_hr_bpm` (NOT NULL) | Sparse | `get_rhr_daily` |
| `hrv` | `calendar_date` (PK), `hrv_value` (nullable) | Dense — one row per day in range; null if no overnight reading | `get_hrv_data_range` |
| `weight` | `calendar_date` (PK), `weight_kg` (nullable) | Stores whatever the API returns; null if no weigh-in that day | `get_weight_snapshot` (`dateWeightList`) |
| `sleep` | `calendar_date` (PK), `sleep_duration_minutes` (nullable), `sleep_need_minutes` (NOT NULL) | Dense; need is always present, duration can be null | `get_sleep_daily` |
| `training_load` | `calendar_date` (PK), `acwr_status`, `acute_load`, `chronic_load`, `acwr_ratio` (all nullable) | Dense; all four columns nulled together when `acwrStatus == "NONE"` (onboarding) | `get_weekly_training_status` → `reportData[<deviceId>][i].acuteTrainingLoadDTO` |

### Running page (2 tables)

| Table | Columns | Notes |
|---|---|---|
| `base_hr_runs` | `activity_id` (PK), `start_time_local`, `distance_m`, `duration_s`, `avg_hr` (NOT NULL), `location` (nullable), `activity_name` (NOT NULL) | Only rows where `activityType == "running"` and the activity name contains `Base-HR` (the run-type marker). Names follow `<Location> - Base-HR` (e.g. `Jeddah - Base-HR`); `location` is the part before ` - `, null if the name has no ` - `. Fetch: `get_activities_by_date`. Refresh: bootstrap `2000-01-01` if empty, else same calendar day as `MAX(start_time_local)` (not +1 day, to avoid missing a second same-day activity a prior refresh only partially caught); insert-if-not-exists by `activity_id`. |
| `laps` | `activity_id` (FK → `base_hr_runs`, `ON DELETE CASCADE`), `lap_index`, `distance_m`, `duration_s`, `avg_hr` (all NOT NULL); PK `(activity_id, lap_index)` | Fetched once per activity via `get_activity_splits` (`lapDTOs` only, `eventDTOs` dropped). Inserted once when the run is first stored — no refresh-overlap, laps don't change after the fact. |

### Strength page (3 tables)

| Table | Columns | Notes |
|---|---|---|
| `workout_sessions` | `workout_id` (PK, from Garmin), `session_label` (NOT NULL) | Manually maintained lookup table — add a row whenever a new workout generation is created on Garmin Connect. |
| `strength_sessions` | `activity_id` (PK), `start_time_local` (NOT NULL), `workout_id` (NOT NULL, FK → `workout_sessions`, no cascade — see above) | Only inserted if `workout_id` already exists in `workout_sessions`; unrecognized workouts are silently skipped. Refresh: bootstrap `2000-01-01` if empty, else `start = MIN(same calendar day as MAX(start_time_local), today - 30 days)` — the 30-day floor re-scans recent history on every refresh so a session skipped for an unregistered `workout_id` still gets picked up once that workout is registered, instead of being permanently missed once a later recognized session advances the high-water mark past it. (`base_hr_runs` has no lookup-table gate, so it doesn't need this floor — plain same-day overlap is enough there.) |
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
(e.g. sync) grows enough to warrant it.

All paths below are inside `fitness/`.

- `app.py` — Flask routes only. Flat, no application factory, no
  blueprints (not worth the overhead for 3 static pages with no auth and
  no test suite). Page route functions are named `<page>_page`
  (`fitness_page`, `running_page`, `strength_page`); that name is also
  the `url_for` endpoint.
- `db.py` — per-request SQLite connection via `flask.g` and
  `app.teardown_appcontext`, following Flask's own documented pattern.
- `queries.py` — read-only SQL for the pages: one function per chart,
  returning plain Python data ready for `| tojson`. Routes call these;
  no SQL in `app.py`.
- `init_db.py` — separate setup command that applies `schema.sql`.
  Run once, and again after editing the schema. `sync.py` and `db.py`
  open the DB in `mode=rw`, so they fail loudly instead of silently
  creating an empty `fitness.db` if setup hasn't been run.
- `garmin_client.py` — Garmin Connect auth, with its own token cache (not
  `~/.garminconnect`).
- `sync.py` — fetch/transform/upsert logic for every table. Fully
  self-contained: opens its own connection, commits, and closes it on
  every run, independent of Flask's per-request connection in `db.py`.
  Exposes `main()`, runnable both as a CLI and importable for the
  eventual `/refresh` route — the same function serves as both a
  standalone script entry point and a Flask route handler. No CLI
  arguments for now; add an `argv` parameter only if options are needed.
  - Internal organization starts bespoke: one independent function per
    table, even though several tables share the same bootstrap/overlap/
    upsert control flow. A shared generic helper is only introduced once
    that duplication is visible across 2–3 real tables, not guessed at
    upfront.
- Templates: `base.html` holds the shared skeleton (doctype, head, the
  stylesheet link, the Chart.js CDN scripts, nav between the pages)
  with a `{% block content %}`; one template per page (`fitness.html`,
  `running.html`, `strength.html`) extends it. Templates contain no
  inline JS or CSS.
- Static files: `static/style.css` holds all styling. One JS file per
  page (`static/fitness.js`, `static/running.js`, `static/strength.js`),
  loaded at the end of that page's template. Each page's JS file grows
  as charts are added to that page (more `new Chart(...)` calls), rather
  than introducing a shared chart helper upfront — same "wait for real
  duplication" principle as `sync.py`.
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
  `sync.py`'s refresh-window date math (bootstrap/overlap/30-day-floor)
  if that logic becomes a concern again — it's already needed
  correction twice during design, and a bug there wouldn't be visually
  obvious on a chart.

## Build order

- Built as vertical slices, one table at a time: fetch → insert → plot,
  fully working end to end before moving to the next table. Not building
  broadly across all 11 tables or all 3 pages at once.
- First slice: `vo2max` — the simplest table (one API call, one value
  column, trivial upsert, a plain line chart), chosen specifically to
  prove the whole pipeline (auth, `db.py`, insert, route, chart) with
  minimal complexity before adding anything else.
- The refresh button is deferred (see "Refresh behavior" above) — run
  `sync.py` manually from the terminal while slices are being built.
- No ORM, no migration tooling — `schema.sql` is hand-edited directly as
  the schema evolves.
- Status: `vo2max` slice done (sync → table → `/fitness` line chart).
  Next slice not yet chosen. The nav in `base.html` only links pages that
  exist; it grows as pages are added.
