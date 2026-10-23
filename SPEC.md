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
- `/strength` — one horizontal bar chart: for each of 9 key exercises,
  the heaviest set in its first session vs in its latest session (two
  bars, kg; tooltip with both dates and the change). The exercises are
  the 4 session groups' main lifts (squat S1, bench press S2, pull-up S3,
  lateral raise S4) plus 5 big accessories (Romanian deadlift, seated
  cable row, wide-grip seated cable row, leg curl, leg extension).
  Chosen over per-group trend lines (heaviest set, estimated 1RM, or
  main-lift volume per session): the bars show at a glance that the
  accessories roughly doubled (+62% to +117%) while the main lifts
  gained about a third, which trend lines per group hid. "Latest", not
  "best", so a drop shows (none among these 9 yet). The 9 come from a
  fixed list in `queries/strength.py` (like `ACWR_BANDS`: hand-written reference
  data), in chart order, each mapping a display label to one Garmin
  exercise name (e.g. pull-up = `WEIGHTED_PULL_UP`). Chosen over picking exercises automatically (main
  lift + heaviest accessories), which with this data would pick calf
  raises (115–120 kg), not the chosen rows and leg work. A new exercise,
  or a new Garmin name for one, needs a list edit. `queries/strength.py` returns
  ready rows (label, first kg and date, latest kg and date);
  `strength.js` only draws them. Pull-ups show the added weight only, as
  Garmin records it (first bar 0 = bodyweight, latest +15 kg), not body
  weight + added from the `weight` table (78.5 → 90.2 kg): simpler, and
  it matches the number on the belt and in the Garmin app. Each pair of
  bars has its change written just past the longer bar (`+38%`; `+15 kg`
  when the first value is 0, which has no %), by a small `gainLabels`
  plugin in `strength.js` (like `bandsPlugin`, in `GREYS.label`), so
  relative progress reads without hovering while the bars keep real kg —
  on one kg axis lateral raise (15 → 20, +33%) looks flat next to
  Romanian deadlift (60 → 100). Chosen over kg bars with % only in the
  tooltip, and over one %-gain bar per exercise (which can't show the
  pull-up and hides the weights).
  Below it, per session group (S1, S2, S3, S4; built S1 first as a
  slice, then the rest): one small chart per exercise in that group, x = session date,
  a line for the average weight across that exercise's sets in the
  session and a shaded band from the lightest to the heaviest set (the
  band's top is the heaviest set). One chart per exercise, not one chart
  per group with a line per exercise: on one kg axis the small lifts
  (kickback 7.5 → 12.5) flatten next to squat (65 → 90), and the
  average shows progress the heaviest set misses (kickback's heaviest
  set sat at 10 kg for four sessions while its average rose 8.8 →
  11.2). Weights are added kg, as on the bar chart; the band's bottom is
  mostly warm-up sets. Garmin sends bodyweight sets as −1 g (stored as
  −0.0 kg after rounding), counted as 0. The exercises are found
  automatically, not from a list: one chart per distinct Garmin
  exercise `name` in the group, labelled from that name
  (`EZ_BAR_PREACHER_CURL` → "Ez bar preacher curl"), in the order the
  exercises first appear in the group's sessions — no alias map, no
  fallback category, no special cases.

  Exercise names are kept clean **at the source**, not with rules in the
  code: the inconsistencies (37 sets in 7 sessions, 2026-08-07 to
  2026-09-19) were all on sets not linked to a workout step
  (`wktStepIndex` null) — linked sets take the name from the workout —
  and were fixed by editing them in Garmin Connect on 2026-10-24
  (bodyweight variants `PULL_UP` with no name, `SUSPENDED_DIP`, `CRUNCH`
  with no name → their `WEIGHTED_*` names; S3's one-off standing calf
  raise → seated). A weighted exercise can be entered without weight, so
  a bodyweight set is the weighted exercise at 0 kg. Since then every
  group has exactly 6 exercises, each under one name. If a new odd name
  appears (most likely on a set added outside the workout's steps), fix
  it in Garmin and rebuild the DB: sets are fetched once per session, so
  edits to already-synced sessions are only picked up by a rebuild.

All three pages show full history only — no date range picker.

## Out of scope

- Diet / nutrition — no `estimate_nutrition.py` equivalent, no diet report.
- Weather data — dropped entirely. No page uses it, and refresh does not
  fetch it.
- Non-running / non-strength activities (hiking, swimming, rucking,
  etc.) — never stored.
- Strength activities without a `workoutId` (free sessions Garmin names
  just "Strength", 3 so far, two of them 1–2 accidental sets) — silently
  skipped, not an error.
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
  either way. No table holds hand-entered data (the planned
  `workout_sessions` lookup was dropped, see the strength page), so a
  rebuild of `fitness.db` loses nothing a sync can't restore.
- Open decision, deferred: whether to show "current status" summaries
  (e.g. the latest ACWR status and ratio as a text flag above the chart).
  Tried and removed for now; the data is already in `training_load`.

## Database schema

10 tables, SQLite, defined in `schema.sql`. Foreign keys are declared and
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
children are meaningless without their parent.

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
(`queries.daily.rolling_average`, window `ROLLING_DAYS = 7`): for each stored
day, the mean of the non-null values in the 7 calendar days ending on it
(fewer values on sparse stretches, e.g. weight on days without a
weigh-in). 7 days matches Garmin's own 7-day HRV and resting-HR averages
and cuts the day-to-day jump by 70–85% (weight 0.44 → 0.14 kg, resting
HR 1.89 → 0.28 bpm, HRV 5.56 → 0.94 ms).

| Table | Columns | Shape | Fetch |
|---|---|---|---|
| `vo2max` | `calendar_date` (PK), `vo2max_precise_value` (NOT NULL) | Sparse — only days Garmin computed a value | `get_max_metrics_range` (whole range in one request; list of entries, value at `generic.vo2MaxPreciseValue`, entries with null `generic` or value skipped). The API has no rating (Poor…Superior) field (`maxMetCategory` is 0, not a rating), so the page shades the Cooper Institute bands Garmin uses, for men aged 30–39 (`VO2MAX_BANDS` in `fitness.js`: Fair 40.5, Good 44, Excellent 48.3, Superior 54); switch to the 40–49 row at age 40. Points in the EXCELLENT band (48.3 ≤ value < 54) are drawn green (`highlightPoints`) |
| `resting_hr` | `calendar_date` (PK), `resting_hr_bpm` (NOT NULL) | Sparse — days without a reading are absent | `get_rhr_daily` (list of `{calendarDate, value}`; value is a float, rounded to int). The library documents a ~1-year limit per request, so the range is fetched in ≤365-day windows (`date_windows` in `sync/common.py`) — one request today; more only once a bootstrap spans over a year |
| `hrv` | `calendar_date` (PK), `hrv_value`, `hrv_status`, `baseline_low_upper`, `baseline_balanced_low`, `baseline_balanced_upper` (all nullable) | Dense — one row per day in range; null if no overnight reading | `get_hrv_data_range` → `hrvSummaries[i].lastNightAvg` (ms); missing days filled with null. The API rejects ranges over 366 days (400 error), so fetched in ≤365-day windows. Same response: `status` → `hrv_status` (`BALANCED`, `UNBALANCED`, `LOW`; Garmin's `NONE` while calibrating, the first 18 days, is stored as null, as for `training_load`), and `baseline.lowUpper` / `balancedLow` / `balancedUpper` → the three `baseline_*` columns (null while calibrating). Status is stored, not computed: the rule it follows (7-day average inside `balancedLow`–`balancedUpper`, edges included = BALANCED; outside = UNBALANCED; below `lowUpper` = LOW) matched all 99 days with a baseline but is inferred, not documented, LOW has never occurred, and recent days sit within 1 ms of the edge, where our own 7-day average (≤ 1.1 ms off Garmin's) could flip it. `weeklyAvg` and `baseline.markerValue` (Garmin's gauge position) are not stored. Page: the HRV chart draws the balanced range (green) and the strip down to `lowUpper` (yellow, dashed LOW limit) behind the dots and 7-day line (`addHrvBaseline` in `fitness.js`, from `queries.daily.load_hrv_baseline` via `data-baseline`); rings on the 7-day line mark days whose Garmin status isn't BALANCED (UNBALANCED orange, LOW red; 3 so far: 2026-10-17, -20, -21), so status is read from the line, never from single dots; the tooltip names Garmin's status for the day. Since status follows the 7-day average, a single night outside the band (e.g. 93 ms on 2026-09-14, average 82 inside 67–83) is still BALANCED. Added 2026-10-23 (DB rebuilt; strength tables still empty) |
| `weight` | `calendar_date` (PK), `weight_kg` (NOT NULL) | Sparse — weigh-in days only; the chart line connects weigh-ins | `get_weight_snapshot` → `dateWeightList` (whole range in one request, no limit observed). `weight` is in grams → kg (2 dp). `sourceType == "USER_SETTING"` entries (the weight from Garmin profile settings, not a weigh-in) are skipped. Several weigh-ins on one day → latest by `timestampGMT` |
| `sleep` | `calendar_date` (PK), `sleep_duration_minutes` (nullable), `sleep_need_minutes` (NOT NULL) | Sparse — recorded nights only (a missed night has no entry at all, so there's no need value to store; the chart shows no bar for it). Duration stays nullable in case Garmin sends a night with a need but no duration; none so far | `get_sleep_daily` → `values.totalSleepTimeInSeconds` (→ minutes, rounded) and `values.sleepNeed` (already minutes); entries without `sleepNeed` skipped. The library splits ranges into 28-day requests itself. Charted as one bar per night (`queries.daily.load_sleep_shortfall`): duration minus need, in minutes, red below zero (short of need), green above, darker grid line at zero, plus a 7-day rolling-average line on top (`queries.daily.rolling_average`, as for resting HR/HRV/weight), in Chart.js's default blue rather than the pink-red of the other averages, which blends into the red bars. Each point also carries the night's sleep (`slept`, minutes), so the tooltip shows `-51 min (slept 6:59)` (`formatMinutes` in `fitness.js`) and the average (`7-day average: -68 min`). Replaces an earlier two-line chart (sleep, dashed sleep need, in hours): the need is ~470 min almost every night, so the flat need line added little, while the gap to it is what matters (short on 88 of 116 nights, by 63 min on average) |
| `training_load` | `calendar_date` (PK), `acwr_status`, `acute_load`, `chronic_load`, `acwr_ratio` (all nullable) | Dense — the API returns every day; all four columns nulled together when `acwrStatus == "NONE"` (onboarding, 06-28 to 07-03). `acwr_ratio` can also be null on days that do have a status (07-04 to 07-10); stored as Garmin reports it, not recomputed (Garmin's ratio isn't a plain acute/chronic division) | `get_weekly_training_status` → `reportData[<deviceId>][i].acuteTrainingLoadDTO`: `acwrStatus`, `dailyTrainingLoadAcute`, `dailyTrainingLoadChronic`, `dailyAcuteChronicWorkloadRatio`. Whole range in one request, no limit observed. Entries with `primaryTrainingDevice == false` skipped. Page: a `dailyLineChart` of the ratio, with shaded status bands behind it (LOW < 0.8, OPTIMAL 0.8–1.5, HIGH ≥ 1.5; `ACWR_BANDS` in `fitness.js`). The cut-offs are inferred from the data — every stored status matches them — not from Garmin documentation; a VERY HIGH status (sports-science literature uses > 2.0) has never been observed, so it has no band yet. The y-axis uses `suggestedMax: 1.7` so the HIGH band is always visible. Points with a ratio in the HIGH band (≥ 1.5, read from `ACWR_BANDS`) are drawn red (`highlightPoints`) |

### Running page (2 tables)

Charts: pace and aerobic decoupling (base-HR runs), metres per
heartbeat (all runs). Metres per heartbeat (`queries.running.load_metres_per_beat`)
= speed in m/min ÷ average HR, one dot per run with HR, x = date; it
replaced a planned pace-vs-HR-by-location scatter, which with HR capped
just repeated the pace chart (base-HR runs all sit at 131–137 bpm in one
location), while metres per heartbeat across all runs shows the trend
for every run type (0.87–0.95 in early July, 0.99–1.07 in Sep–Oct).
Each point also carries name, location, type, pace and HR for the
tooltip. A thin grey line joins the runs in date order. Colour =
`run_type`, from a fixed map in `running.js` (`RUN_TYPE_COLORS`, like
`ACWR_BANDS`): `Base-HR` blue (`SERIES_BLUE`, as on the pace and decoupling lines), `Threshold` orange, `Base` aqua,
`Sprint` yellow, `Recovery` magenta, `Threshold-HR` violet; null shows
as "Free run" in grey, and a type missing from the map also shows grey,
under its own name — the cue to add it. Shape = location:
`HOME_LOCATION = "Jeddah"` (and runs without a location) as circles, any
other location as triangles. Seven colours in a scatter are near the
limit of what's easy to tell apart (yellow/orange especially); the
tooltip names every run.

| Table | Columns | Notes |
|---|---|---|
| `runs` | `activity_id` (PK), `start_time_local`, `distance_m`, `duration_s`, `activity_name` (all NOT NULL), `avg_hr`, `location`, `run_type` (nullable) | Every activity with `activityType == "running"` (all run types, not just base-HR). Fetch: `get_activities_by_date(start, end, "running")`, then the type check; `duration_s` = `duration`, `avg_hr` = `averageHR` rounded (nullable: a run recorded without HR is a legitimate state; none so far). `location` and `run_type` are parsed from the name at sync time by `parse_run_name` in `sync/running.py`, so the naming rule lives in one place — strict patterns, no keyword matching: `<Location> - <Type>`, split on the first ` - ` (spaces included), location before, type after, taken as-is; `<Location> Running` (Garmin's automatic name for a run nobody renamed, e.g. `Jeddah Running`) → location, type null (a free run), so forgetting to rename one costs nothing; anything else → both null (a treadmill run might come as `Treadmill Running` and parse as location "Treadmill" — none yet; rename it if it shows up). Hyphens inside the type are kept, so `Base-HR` (custom HR-capped workout) and `Base` (Garmin's suggested workout), and likewise `Threshold-HR` and `Threshold`, are distinct types. Names are fixed at the source, in Garmin Connect, and kept consistent (`Jeddah-Threshold-HR` on 2026-10-10 was renamed to `Jeddah - Threshold-HR`); `Laganas - Base` (2026-09-07, max HR 149) stays `Base` — Garmin's default workout, only under 150 because it was cooler. Base-HR charts select `WHERE run_type = BASE_HR_RUN_TYPE` (`"Base-HR"`, in `config.py`, shared by sync and queries). Pace is derived when charting (`duration_s / distance_m`, shown as `m:ss /km`), not stored. Refresh: start at `FIRST_DATA_DATE` if empty, else same calendar day as `MAX(start_time_local)` (not +1 day, to avoid missing a second same-day activity a prior refresh only partially caught); insert-if-not-exists by `activity_id` (`store_new`, `INSERT OR IGNORE`; the sync log shows runs found vs. new). Replaced an earlier `base_hr_runs` table that kept base-HR runs only (DB rebuilt on 2026-10-23, before any hand-entered data existed). |
| `laps` | `activity_id` (FK → `runs`, `ON DELETE CASCADE`), `lap_index`, `distance_m`, `duration_s`, `avg_hr` (all NOT NULL); PK `(activity_id, lap_index)` | Fetched once per activity via `get_activity_splits` (`lapDTOs` only, `eventDTOs` dropped). Base-HR runs only: each sync fetches laps for every stored base-HR run that has none yet (`runs_without_laps`) — normally just the newly stored runs, but it also backfills and retries after a failed fetch; no refresh-overlap, laps don't change after the fact. `lap_index` = Garmin's `lapIndex` (1-based). Laps without `averageHR` or `distance` are skipped. Only base-HR laps are clean 1 km auto-laps, which decoupling assumes; interval workouts (`Threshold`, `Threshold-HR`, `Sprint`) have workout-step laps (e.g. 15 laps of 20–372 m) and even easy types can have odd mid-run laps (a 46 m lap on a Recovery run). Widening to other types later is a one-condition change in `runs_without_laps`, which backfills without a rebuild. All laps of a base-HR run are stored, including the short final lap (typically 10–60 m). Aerobic decoupling (`queries.running.load_decoupling`), per run: take the full-km laps (`distance_m >= FULL_KM_MIN_M`, 950, which excludes that short final lap), skip the first (warm-up: HR is still catching up, 110–119 vs. 131–135 in km 2), split the rest into two halves of whole laps (an odd count drops the middle lap), and compute efficiency = speed ÷ time-weighted average HR for each half; decoupling = (first − second) / first × 100, in % (positive = less efficient in the second half). With 5 full km that is km 2–3 vs. km 4–5. Null (a gap) if fewer than 3 full-km laps. Replaces an earlier pace-fade chart (last km pace minus first km pace), whose first-km baseline mixed warm-up pacing into the value; including km 1 (km 3 split in half) gave the same trend but 2–6 points higher, varying with the warm-up |

### Strength page (2 tables)

| Table | Columns | Notes |
|---|---|---|
| `strength_sessions` | `activity_id` (PK), `start_time_local`, `workout_id`, `session_label` (all NOT NULL) | Every activity with `activityType == "strength_training"` **and** a `workoutId` (activities from one of your Garmin Connect workouts); free sessions without one are skipped. Fetch: `get_activities_by_date(start, end)` with no type filter, then the type check — `strength_training` is a sub-type, which the endpoint rejects as a filter (400 "Activity type cannot be an activity sub type"). `session_label` = the activity name as-is (e.g. `S1 Squats`): Garmin names each session after its workout, so the name is the session group, the same idea as `run_type` from run names. Chosen over a hand-entered `workout_sessions` lookup (`workoutId` → label): every workout's 7–8 sessions so far have one `workoutId` and one matching name, and the name needs no table, no seed file and survives rebuilds, while a new workout version (new `workoutId`) with the same name just continues the group. Renaming a workout starts a new group (rename old sessions in Garmin to merge); two different workouts with one name would merge. Refresh: as for `runs` — start at `FIRST_DATA_DATE` if empty, else same calendar day as `MAX(start_time_local)`; insert-if-not-exists by `activity_id` (no 30-day re-scan floor: there is no lookup table whose late registration could make a session be skipped). |
| `strength_sets` | `activity_id` (FK → `strength_sessions`, `ON DELETE CASCADE`), `set_index` (0-based, ACTIVE sets only), `category`, `reps` (NOT NULL), `name`, `weight_kg` (nullable); PK `(activity_id, set_index)` | Fetched once per session via `get_activity_exercise_sets`, filtered to `setType == "ACTIVE"`, taking `exercises[0]` (Garmin's top detected exercise); each sync fetches sets for every stored session that has none yet (`sessions_without_sets`), like laps. `weight` is in grams → kg (2 dp). `name` is nullable: Garmin sends only `category` on some sets (25 of 899: 13 pull-up, 12 crunch). `weight_kg` is nullable and stored as given: bodyweight sets come as `0`, `-0` or missing (2 sets). Charts count a missing or `-0` weight as 0 kg added. Names were made consistent at the source (see the strength page in "Pages"). |

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
- `queries/` — read-only SQL for the pages, one module per page like
  `sync/`: `daily.py` (fitness page), `running.py`, `strength.py`;
  routes import them as `from fitness.queries import daily, running,
  strength`. One named function per chart (`load_vo2max`, …), returning
  plain Python data ready for `| tojson`. Daily series share
  `load_daily_points(table, value_column)` ({x: date, y: value} points,
  nulls kept); the named wrappers keep table/column names out of the
  routes. No SQL in `app.py`. Split from a single `queries.py` once it
  reached ~340 lines across three pages; no helper is shared across
  pages, so there is no `common.py`. In `strength.py`, the bar chart and
  the trend charts read sets the same way (`load_strength_sets` →
  `session_weights`); the bar chart takes each session's max.
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
  - `common.py` — `open_connection`, `activity_start_date`, `store_new`, `date_windows`, `days_in_range`.
  - `daily.py` — the six fitness-page tables, `daily_start_date`, and
    the per-endpoint range limits (`RESTING_HR_MAX_DAYS`,
    `HRV_MAX_DAYS`).
  - `running.py` — `runs` and `laps`.
  - `strength.py` — `strength_sessions` and `strength_sets`.

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
    (split long ranges for endpoints with a per-request limit),
    `days_in_range` (fill dense tables), and for the activity tables
    `activity_start_date(conn, table)` (refresh start: day of the latest
    `start_time_local`) and `store_new(conn, table, columns, rows)`
    (writes new activity rows; runs, laps, strength sessions and sets).
    The "fetch details for activities that have none yet" step
    (`runs_without_laps`/`sync_laps`, `sessions_without_sets`/`sync_sets`)
    is similar in two places but not extracted — the API calls differ;
    revisit if a third appears. Fetch and parse stay per-table —
    they differ in endpoint and response shape — and so does each
    `sync_<table>`, which shows that table's specifics.
  - Storing: daily rows are written as insert-or-update
    (`INSERT ... ON CONFLICT (calendar_date) DO UPDATE`, a.k.a. "upsert")
    by `store_daily` — new days are added, existing days overwritten.
    Never `INSERT OR REPLACE` (it deletes first, which can fire
    cascades). Activity tables, which only add rows that don't exist
    yet, use `store_new` (`INSERT OR IGNORE`).
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
  - `STATUS_COLORS` / `statusColor(name, alpha)` — the one set of status
    colours (green, yellow, orange, red, blue) for bands, highlighted
    points, sleep bars and HRV band/rings; every chart takes them from
    here. Series (lines, dots) keep Chart.js's default colours (blue
    data, pink-red 7-day averages; sleep's average is blue, see `sleep`).
    The status set is Chart.js's yellow, orange and blue plus a green
    (75, 192, 92) and a tomato red (255, 99, 71) that differ from
    Chart.js's teal and pink-red on purpose: the pink-red is the average
    line colour, and the teal is too close to the series blue for a
    single highlighted point to show (the one EXCELLENT VO2max point
    vanished). Chosen over a colour-blind-validated palette and over pure
    Chart.js defaults by comparing all three on the real charts.
  - `GREYS` — the greys for non-data marks, by role: `grid` and `label`
    are Chart.js's own defaults (`Chart.defaults.borderColor`,
    `Chart.defaults.color`); `guide` (25% black) for background edges and
    joining lines (HRV band edges, the all-runs path); `strong` (50%
    black) for lines meant to be noticed (sleep's zero line, date
    markers).
  - `SERIES_BLUE` — Chart.js's default 1st-series blue, for series that
    set their colour explicitly (the sleep average, the `Base-HR` run
    type), so base-HR runs are the same blue on every running chart.
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
- Chart data flow: a route calls `queries/`, which returns a plain
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
  broadly across all 10 tables or all 3 pages at once.
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
  `sync/` package. Running page done, built in steps:
  1. done — base-HR runs sync + `/running` page with a pace chart;
  2. done, then dropped — duration and average heart-rate charts
     (see "Pages");
  3. done — `runs` table for all runs (replacing `base_hr_runs`), with
     `run_type`/`location` parsed from the name, and the all-runs
     metres-per-heartbeat chart (replacing the planned pace-vs-HR
     scatter);
  4. done — `laps` sync + aerobic-decoupling chart (replaced the
     first pace-fade chart).

  Strength page: `strength_sessions` + `strength_sets` sync and the
  first-vs-latest bar chart done (DB rebuilt on 2026-10-24, and again
  after the exercise names were fixed in Garmin). Per-exercise trend
  charts (`queries.strength.load_exercise_trends()`,
  `exerciseTrendChart` in `strength.js`, a `.chart-grid` of
  `.chart-small` charts): done for all groups. The groups come from the
  data (every `session_label` with stored sets, sorted, so S1–S4 in
  order), like the exercises within them — a new workout shows up as a
  new section by itself.

  The nav in
  `base.html` only links pages that exist; it grows as pages are added.
