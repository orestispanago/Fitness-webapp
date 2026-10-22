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
- Database migrations / ORM — `schema.sql` is a one-time, idempotent
  initializer; schema changes are hand-edited directly in that file.
- LAN access — localhost-only for now, LAN is a later phase.

## Tech stack

- Backend: Flask, server-rendered Jinja2 templates, minimal vanilla JS.
- Charts: Chart.js via CDN, hover tooltips only, no zoom/pan.
- Storage: SQLite (`fitness.db` at the project root, gitignored), accessed via raw SQL
  (stdlib `sqlite3`) — no ORM.
- Styling: bare-bones HTML/CSS.

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
| `vo2max` | `calendar_date` (PK), `vo2max_precise_value` (NOT NULL) | Sparse — only days Garmin computed a value | `get_max_metrics_range` |
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

- `app.py` — Flask routes only. Flat, no application factory, no
  blueprints (not worth the overhead for 3 static pages with no auth and
  no test suite).
- `db.py` — per-request SQLite connection via `flask.g` and
  `app.teardown_appcontext`, following Flask's own documented pattern.
  Used by the page routes for reading chart data.
- `garmin_client.py` — Garmin Connect auth, with its own token cache (not
  `~/.garminconnect`).
- `sync.py` — fetch/transform/upsert logic for every table. Fully
  self-contained: opens its own connection, commits, and closes it on
  every run, independent of Flask's per-request connection in `db.py`.
  Exposes `main(argv=None)`, runnable both as a CLI and importable for
  the eventual `/refresh` route — the same function serves as both a
  standalone script entry point and a Flask route handler.
  - Internal organization starts bespoke: one independent function per
    table, even though several tables share the same bootstrap/overlap/
    upsert control flow. A shared generic helper is only introduced once
    that duplication is visible across 2–3 real tables, not guessed at
    upfront.
- Templates: `base.html` holds the shared skeleton (doctype, head, the
  Chart.js CDN script, nav between the three pages) with a
  `{% block content %}`; one template per page (`fitness.html`,
  `running.html`, `strength.html`) extends it. Each page's template
  grows inline as more charts are added to that page (more `<canvas>` +
  embedded data + `new Chart(...)` calls), rather than splitting into
  per-chart partials upfront — same "wait for real duplication"
  principle as `sync.py`, applied to templates.
- Chart data flow: a route queries SQLite, builds a plain Python data
  structure, and passes it into the template context; the template
  embeds it directly into an inline `<script>` via Jinja2's `| tojson`
  filter. No JSON API endpoint, no client-side `fetch()` — nothing in
  this app needs data without a full page reload.
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
- No code written yet beyond `schema.sql`, `example.py` (scratch
  exploration), and `config.py`.
