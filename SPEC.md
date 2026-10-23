# Fitness webapp — spec

Personal, single-user Flask app with a SQLite-backed database and trend
charts, built incrementally, one vertical slice at a time.

## Pages

- `/fitness` — conditioning (VO2max, resting HR, HRV), weight (with a
  marker for the creatine start date), sleep
  shortfall (sleep minus sleep need, per night), ACWR status flag.
- `/running` — pace and aerobic decoupling for base-HR runs only, plus
  metres per heartbeat (speed ÷ average HR) for all runs. No duration chart: every
  run so far is ~5 km, so duration only repeats pace, and pace stays
  comparable if the distance changes. No average-HR chart: runs are
  paced to keep max HR under 150, so average HR (131–137 so far) is set
  by pacing, warm-up and heat, not fitness — fitness shows up as pace.
- `/strength` — overview + per-session-group trend charts (e.g. S1 Squats,
  S2 Chest, S3 Pull-ups, S4 Shoulders).

All three pages show full history only — no date range picker.

## Out of scope

- Diet / nutrition — no `estimate_nutrition.py` equivalent, no diet report.
- Weather data — dropped entirely. No page uses it, and refresh does not
  fetch it.
- Non-running / non-strength activities (hiking, swimming, rucking,
  etc.) — never stored.
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
(`laps` → `runs`, `strength_sets` → `strength_sessions`), where
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

Rolling averages: resting HR, HRV and weight are charted as daily dots
(no connecting line) plus a 7-day rolling-average line
(`dailyAverageChart` in `charts.js`). The average is computed in Python
(`queries.rolling_average`, window `ROLLING_DAYS = 7`): for each stored
day, the mean of the non-null values in the 7 calendar days ending on it
(fewer values on sparse stretches, e.g. weight on days without a
weigh-in). 7 days matches Garmin's own 7-day HRV and resting-HR averages
and cuts the day-to-day jump by 70–85% (weight 0.44 → 0.14 kg, resting
HR 1.89 → 0.28 bpm, HRV 5.56 → 0.94 ms).

| Table | Columns | Shape | Fetch |
|---|---|---|---|
| `vo2max` | `calendar_date` (PK), `vo2max_precise_value` (NOT NULL) | Sparse — only days Garmin computed a value | `get_max_metrics_range` (whole range in one request; list of entries, value at `generic.vo2MaxPreciseValue`, entries with null `generic` or value skipped). The API has no rating (Poor…Superior) field (`maxMetCategory` is 0, not a rating), so the page shades the Cooper Institute bands Garmin uses, for men aged 30–39 (`VO2MAX_BANDS` in `fitness.js`: Fair 40.5, Good 44, Excellent 48.3, Superior 54); switch to the 40–49 row at age 40. Points in the EXCELLENT band (48.3 ≤ value < 54) are drawn green (`highlightPoints`) |
| `resting_hr` | `calendar_date` (PK), `resting_hr_bpm` (NOT NULL) | Sparse — days without a reading are absent | `get_rhr_daily` (list of `{calendarDate, value}`; value is a float, rounded to int). The library documents a ~1-year limit per request, so the range is fetched in ≤365-day windows (`date_windows` in `sync/common.py`) — one request today; more only once a bootstrap spans over a year |
| `hrv` | `calendar_date` (PK), `hrv_value`, `hrv_status`, `baseline_low_upper`, `baseline_balanced_low`, `baseline_balanced_upper` (all nullable) | Dense — one row per day in range; null if no overnight reading | `get_hrv_data_range` → `hrvSummaries[i].lastNightAvg` (ms); missing days filled with null. The API rejects ranges over 366 days (400 error), so fetched in ≤365-day windows. Same response: `status` → `hrv_status` (`BALANCED`, `UNBALANCED`, `LOW`; Garmin's `NONE` while calibrating, the first 18 days, is stored as null, as for `training_load`), and `baseline.lowUpper` / `balancedLow` / `balancedUpper` → the three `baseline_*` columns (null while calibrating). Status is stored, not computed: the rule it follows (7-day average inside `balancedLow`–`balancedUpper`, edges included = BALANCED; outside = UNBALANCED; below `lowUpper` = LOW) matched all 99 days with a baseline but is inferred, not documented, LOW has never occurred, and recent days sit within 1 ms of the edge, where our own 7-day average (≤ 1.1 ms off Garmin's) could flip it. `weeklyAvg` and `baseline.markerValue` (Garmin's gauge position) are not stored. Page: the HRV chart draws the balanced range (green) and the strip down to `lowUpper` (amber, dashed LOW limit) behind the dots and 7-day line (`addHrvBaseline` in `fitness.js`, from `queries.load_hrv_baseline` via `data-baseline`); rings on the 7-day line mark days whose Garmin status isn't BALANCED (UNBALANCED orange, LOW red; 3 so far: 2026-10-17, -20, -21), so status is read from the line, never from single dots; the tooltip names Garmin's status for the day. Since status follows the 7-day average, a single night outside the band (e.g. 93 ms on 2026-09-14, average 82 inside 67–83) is still BALANCED. Added 2026-10-23 (DB rebuilt; strength tables still empty) |
| `weight` | `calendar_date` (PK), `weight_kg` (NOT NULL) | Sparse — weigh-in days only; the chart line connects weigh-ins | `get_weight_snapshot` → `dateWeightList` (whole range in one request, no limit observed). `weight` is in grams → kg (2 dp). `sourceType == "USER_SETTING"` entries (the weight from Garmin profile settings, not a weigh-in) are skipped. Several weigh-ins on one day → latest by `timestampGMT` |
| `sleep` | `calendar_date` (PK), `sleep_duration_minutes` (nullable), `sleep_need_minutes` (NOT NULL) | Sparse — recorded nights only (a missed night has no entry at all, so there's no need value to store; the chart shows no bar for it). Duration stays nullable in case Garmin sends a night with a need but no duration; none so far | `get_sleep_daily` → `values.totalSleepTimeInSeconds` (→ minutes, rounded) and `values.sleepNeed` (already minutes); entries without `sleepNeed` skipped. The library splits ranges into 28-day requests itself. Charted as one bar per night (`queries.load_sleep_shortfall`): duration minus need, in minutes, red below zero (short of need), green above, darker grid line at zero, plus a 7-day rolling-average line on top (`queries.rolling_average`, as for resting HR/HRV/weight). Each point also carries the night's sleep (`slept`, minutes), so the tooltip shows `-51 min (slept 6:59)` (`formatMinutes` in `fitness.js`) and the average (`7-day average: -68 min`). Replaces an earlier two-line chart (sleep, dashed sleep need, in hours): the need is ~470 min almost every night, so the flat need line added little, while the gap to it is what matters (short on 88 of 116 nights, by 63 min on average) |
| `training_load` | `calendar_date` (PK), `acwr_status`, `acute_load`, `chronic_load`, `acwr_ratio` (all nullable) | Dense — the API returns every day; all four columns nulled together when `acwrStatus == "NONE"` (onboarding, 06-28 to 07-03). `acwr_ratio` can also be null on days that do have a status (07-04 to 07-10); stored as Garmin reports it, not recomputed (Garmin's ratio isn't a plain acute/chronic division) | `get_weekly_training_status` → `reportData[<deviceId>][i].acuteTrainingLoadDTO`: `acwrStatus`, `dailyTrainingLoadAcute`, `dailyTrainingLoadChronic`, `dailyAcuteChronicWorkloadRatio`. Whole range in one request, no limit observed. Entries with `primaryTrainingDevice == false` skipped. Page: a `dailyLineChart` of the ratio, with shaded status bands behind it (LOW < 0.8, OPTIMAL 0.8–1.5, HIGH ≥ 1.5; `ACWR_BANDS` in `fitness.js`). The cut-offs are inferred from the data — every stored status matches them — not from Garmin documentation; a VERY HIGH status (sports-science literature uses > 2.0) has never been observed, so it has no band yet. The y-axis uses `suggestedMax: 1.7` so the HIGH band is always visible. Points with a ratio in the HIGH band (≥ 1.5, read from `ACWR_BANDS`) are drawn red (`highlightPoints`) |

### Running page (2 tables)

Charts: pace and aerobic decoupling (base-HR runs), metres per
heartbeat (all runs). Metres per heartbeat (`queries.load_metres_per_beat`)
= speed in m/min ÷ average HR, one dot per run with HR, x = date; it
replaced a planned pace-vs-HR-by-location scatter, which with HR capped
just repeated the pace chart (base-HR runs all sit at 131–137 bpm in one
location), while metres per heartbeat across all runs shows the trend
for every run type (0.87–0.95 in early July, 0.99–1.07 in Sep–Oct).
Each point also carries name, location, type, pace and HR for the
tooltip. A thin grey line joins the runs in date order. Colour =
`run_type`, from a fixed map in `running.js` (`RUN_TYPE_COLORS`, like
`ACWR_BANDS`): `Base-HR` blue, `Threshold` orange, `Base` aqua,
`Sprint` yellow, `Recovery` magenta, `Threshold-HR` violet; null shows
as "Free run" in grey, and a type missing from the map also shows grey,
under its own name — the cue to add it. Shape = location:
`HOME_LOCATION = "Jeddah"` (and runs without a location) as circles, any
other location as triangles. Seven colours in a scatter are near the
limit of what's easy to tell apart (yellow/orange especially); the
tooltip names every run.

| Table | Columns | Notes |
|---|---|---|
| `runs` | `activity_id` (PK), `start_time_local`, `distance_m`, `duration_s`, `activity_name` (all NOT NULL), `avg_hr`, `location`, `run_type` (nullable) | Every activity with `activityType == "running"` (all run types, not just base-HR). Fetch: `get_activities_by_date(start, end, "running")`, then the type check; `duration_s` = `duration`, `avg_hr` = `averageHR` rounded (nullable: a run recorded without HR is a legitimate state; none so far). `location` and `run_type` are parsed from the name at sync time by `parse_run_name` in `sync/running.py`, so the naming rule lives in one place — strict patterns, no keyword matching: `<Location> - <Type>`, split on the first ` - ` (spaces included), location before, type after, taken as-is; `<Location> Running` (Garmin's automatic name for a run nobody renamed, e.g. `Jeddah Running`) → location, type null (a free run), so forgetting to rename one costs nothing; anything else → both null (a treadmill run might come as `Treadmill Running` and parse as location "Treadmill" — none yet; rename it if it shows up). Hyphens inside the type are kept, so `Base-HR` (custom HR-capped workout) and `Base` (Garmin's suggested workout), and likewise `Threshold-HR` and `Threshold`, are distinct types. Names are fixed at the source, in Garmin Connect, and kept consistent (`Jeddah-Threshold-HR` on 2026-10-10 was renamed to `Jeddah - Threshold-HR`); `Laganas - Base` (2026-09-07, max HR 149) stays `Base` — Garmin's default workout, only under 150 because it was cooler. Base-HR charts select `WHERE run_type = BASE_HR_RUN_TYPE` (`"Base-HR"`, in `config.py`, shared by sync and queries). Pace is derived when charting (`duration_s / distance_m`, shown as `m:ss /km`), not stored. Refresh: start at `FIRST_DATA_DATE` if empty, else same calendar day as `MAX(start_time_local)` (not +1 day, to avoid missing a second same-day activity a prior refresh only partially caught); insert-if-not-exists by `activity_id` (`store_new_runs`, `INSERT OR IGNORE`; the sync log shows runs found vs. new). Replaced an earlier `base_hr_runs` table that kept base-HR runs only (DB rebuilt on 2026-10-23, before any hand-entered data existed). |
| `laps` | `activity_id` (FK → `runs`, `ON DELETE CASCADE`), `lap_index`, `distance_m`, `duration_s`, `avg_hr` (all NOT NULL); PK `(activity_id, lap_index)` | Fetched once per activity via `get_activity_splits` (`lapDTOs` only, `eventDTOs` dropped). Base-HR runs only: each sync fetches laps for every stored base-HR run that has none yet (`runs_without_laps`) — normally just the newly stored runs, but it also backfills and retries after a failed fetch; no refresh-overlap, laps don't change after the fact. `lap_index` = Garmin's `lapIndex` (1-based). Laps without `averageHR` or `distance` are skipped. Only base-HR laps are clean 1 km auto-laps, which decoupling assumes; interval workouts (`Threshold`, `Threshold-HR`, `Sprint`) have workout-step laps (e.g. 15 laps of 20–372 m) and even easy types can have odd mid-run laps (a 46 m lap on a Recovery run). Widening to other types later is a one-condition change in `runs_without_laps`, which backfills without a rebuild. All laps of a base-HR run are stored, including the short final lap (typically 10–60 m). Aerobic decoupling (`queries.load_decoupling`), per run: take the full-km laps (`distance_m >= FULL_KM_MIN_M`, 950, which excludes that short final lap), skip the first (warm-up: HR is still catching up, 110–119 vs. 131–135 in km 2), split the rest into two halves of whole laps (an odd count drops the middle lap), and compute efficiency = speed ÷ time-weighted average HR for each half; decoupling = (first − second) / first × 100, in % (positive = less efficient in the second half). With 5 full km that is km 2–3 vs. km 4–5. Null (a gap) if fewer than 3 full-km laps. Replaces an earlier pace-fade chart (last km pace minus first km pace), whose first-km baseline mixed warm-up pacing into the value; including km 1 (km 3 split in half) gave the same trend but 2–6 points higher, varying with the warm-up |

### Strength page (3 tables)

| Table | Columns | Notes |
|---|---|---|
| `workout_sessions` | `workout_id` (PK, from Garmin), `session_label` (NOT NULL) | Manually maintained lookup table — add a row whenever a new workout generation is created on Garmin Connect. |
| `strength_sessions` | `activity_id` (PK), `start_time_local` (NOT NULL), `workout_id` (NOT NULL, FK → `workout_sessions`, no cascade — see above) | Only inserted if `workout_id` already exists in `workout_sessions`; unrecognized workouts are silently skipped. Refresh: start at `FIRST_DATA_DATE` if empty, else `start = MIN(same calendar day as MAX(start_time_local), today - 30 days)` — the 30-day floor re-scans recent history on every refresh so a session skipped for an unregistered `workout_id` still gets picked up once that workout is registered, instead of being permanently missed once a later recognized session advances the high-water mark past it. (`runs` has no lookup-table gate, so it doesn't need this floor — plain same-day overlap is enough there.) |
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
  - `running.py` — `runs` and `laps`.
  - `strength.py` — to come with its slice.

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
  loaded at the end of that page's template, plus `static/charts.js`
  with helpers shared by every page, loaded from `base.html` after
  Chart.js:
  - `dailyScales(yTitle)` — real-date x-axis, titled y-axis.
  - `dailyLineChart(canvasId, label, yTitle, plugins)` — single-series
    line chart (nulls as gaps), optional Chart.js plugins.
  - `dailyAverageChart(canvasId, label, yTitle, plugins)` — daily
    dots plus a 7-day average line, read from `data-points` and
    `data-average`.
  - `bandsPlugin(bands)` — shades labelled horizontal ranges behind the
    data (used for the ACWR status zones).
  - `highlightPoints(chart, band, color)` — recolours the points whose
    value falls in one band (`{ from, to }`, same shape as `bandsPlugin`'s);
    used for HIGH ACWR (red) and EXCELLENT VO2max (green).
  - `markersPlugin(markers)` — labelled dashed vertical lines at dates,
    behind the data. Markers are hand-written constants in the page's JS
    (`WEIGHT_MARKERS` in `fitness.js`: creatine 5 g/day from
    2026-10-07), like `ACWR_BANDS`; move them to a table only if they
    multiply or are needed on several charts.

  All date charts use `interaction: { mode: "index", intersect: false }`,
  so hovering anywhere shows the tooltip for the nearest date. Charts
  that don't fit `dailyLineChart` (sleep shortfall as coloured bars;
  pace with `m:ss` formatting) get their
  own `new Chart(...)` reusing `dailyScales`. Page-specific helpers
  (`ACWR_BANDS`, `VO2MAX_BANDS`, `formatMinutes`, `formatPace`) stay in the page's file
  until another page needs them — same "wait for real duplication"
  principle as `sync/`.
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
  `sync/` package. Running page in progress, built in steps:
  1. done — base-HR runs sync + `/running` page with a pace chart;
  2. done, then dropped — duration and average heart-rate charts
     (see "Pages");
  3. done — `runs` table for all runs (replacing `base_hr_runs`), with
     `run_type`/`location` parsed from the name, and the all-runs
     metres-per-heartbeat chart (replacing the planned pace-vs-HR
     scatter);
  4. done — `laps` sync + aerobic-decoupling chart (replaced the
     first pace-fade chart).

  The nav in
  `base.html` only links pages that exist; it grows as pages are added.
