# Fitness webapp — spec

Personal, single-user Flask app with a SQLite-backed database and trend
charts, built incrementally, one vertical slice at a time.

## Pages

- `/fitness` — conditioning (VO2max, resting HR, HRV), weight (with a
  marker for the creatine start date), sleep
  shortfall (sleep minus sleep need, per night), ACWR status flag.
- `/running` — pace for base-HR runs only, plus
  metres per heartbeat (speed ÷ average HR) for all runs. No aerobic
  decoupling chart: one was built (efficiency, speed ÷ HR, in km 2–3
  vs. km 4–5 of each base-HR run, from a `laps` table) and removed on
  2026-10-26, with the `laps` table and its sync, because it was hard
  to read at a glance. No duration chart: every
  run so far is ~5 km, so duration only repeats pace, and pace stays
  comparable if the distance changes. No average-HR chart: runs are
  paced to keep max HR under 150, so average HR (131–137 so far) is set
  by pacing, warm-up and heat, not fitness — fitness shows up as pace.
- `/strength` — per-exercise trend charts only, one session group per
  page. An earlier first-vs-latest bar chart (heaviest set per key
  exercise, with gain labels) was removed on 2026-10-26: the trend
  charts are what gets watched, and the variants tried — side-by-side,
  stacked, one chart per group, a bar next to or inside each trend —
  either repeated the trends or forced a 0-based axis that flattened
  them.
  Per session group (S1, S2, S3, S4; built S1 first as a
  slice, then the rest): one small chart per exercise in that group, x = session date,
  a line for the average weight across that exercise's sets in the
  session and a shaded band from the lightest to the heaviest set (the
  band's top is the heaviest set). The subtitle gives the PR: the
  heaviest set and how long ago it was first reached (`findRecordPoint`;
  none if no session beat the first one). It replaced (2026-10-29) a
  dashed line across the chart at the last session's heaviest set.
  Line and band are in ECharts' default colours, the same for every
  group; the per-group colours (`SESSION_COLORS`) were dropped with the
  move to ECharts (2026-11-08), after comparing group-coloured lines and
  bands on the real charts. One chart per exercise, not one chart
  per group with a line per exercise: on one kg axis the small lifts
  (kickback 7.5 → 12.5) flatten next to squat (65 → 90), and the
  average shows progress the heaviest set misses (kickback's heaviest
  set sat at 10 kg for four sessions while its average rose 8.8 →
  11.2). Weights are added kg (bodyweight = 0); the band's bottom is
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
  with no name → their `WEIGHTED_*` names). A weighted exercise can be
  entered without weight, so a bodyweight set is the weighted exercise
  at 0 kg. S3's calf raise was done standing by mistake until 2026-10-09
  and seated from 2026-10-17; the workout step said seated, so the
  standing sessions were renamed `WEIGHTED_STANDING_CALF_RAISE` in Garmin
  (2026-10-29) rather than deleted, and the two show as separate charts.
  Since then each exercise is under one name: S1, S2 and S4 have 6
  exercises, S3 has 7. If a new odd name
  appears (most likely on a set added outside the workout's steps), fix
  it in Garmin and rebuild the DB: sets are fetched once per session, so
  edits to already-synced sessions are only picked up by a rebuild.

  One session group per page, chosen with a row of tabs (links, one per
  group), so the workout you're about to do is found without scrolling
  past the others (25 charts, ~1,400 px per group on a phone). Chosen
  on 2026-11-07 over jump links to anchors on one long page and
  collapsible `<details>` groups with only one open, after trying all
  three in a demo on laptop and phone. With no group chosen, the page
  shows the latest session's group. Chosen 2026-11-07 over guessing the
  next one due from the rotation (sessions mostly follow label order,
  2–4 days apart, but the order has broken before), alone or with the
  latest group on a day a session was done, and over always the first
  group; the tabs reach any other group in one tap.
  A tab links to `/strength?group=<session_label>`,
  the label as-is (`url_for` writes `?group=S2+Chest`); a missing or unknown `group`
  gets the default. Chosen 2026-11-07 over a slug (`?group=s2-chest`,
  which needs a conversion each way for looks only) and a path segment
  (`/strength/<group>`, a second route; no other page has one).

All three pages show full history only — no date range picker.

## Out of scope

- Diet / nutrition — no `estimate_nutrition.py` equivalent, no diet report.
- Weather data — except the per-run weather on `runs` (temperature,
  feels-like, humidity) for the EF tooltip; no daily weather is fetched.
- Non-running / non-strength activities (hiking, swimming, rucking,
  etc.) — never stored.
- Strength activities without a `workoutId` (free sessions Garmin names
  just "Strength", 3 so far, two of them 1–2 accidental sets) — silently
  skipped, not an error.
- Chart zoom/pan — tap/hover tooltips only.
- Database migrations / ORM — `fitness/schema.sql` is a one-time,
  idempotent initializer; schema changes are hand-edited directly in that
  file.

## Tech stack

- Backend: Flask, server-rendered Jinja2 templates, minimal vanilla JS.
- Charts: Apache ECharts 6.0.0 via CDN (`echarts.min.js`, the full
  build), tap/hover tooltips only, no zoom/pan. Date axes use ECharts'
  `time` axis, so sparse series are spaced by real dates, not evenly.
  Moved from Chart.js on 2026-11-08 for its touch behaviour: Chart.js
  opens a tooltip on `touchstart`, so a scroll that starts on a chart
  opened one, and with no `mouseout` on a touch screen it stayed open
  until a tap in an empty spot. ECharts opens a tooltip on a tap but not
  on a scroll, and places it better. Costs: a bigger download (~1.1 MB
  minified, ~360 KB gzipped, vs ~200 KB for Chart.js) and a rewrite of
  every chart. Tried page by page (strength, running, then fitness one
  chart at a time) with ECharts' defaults first, then adjusting only
  what didn't work.
- Storage: SQLite (`data/fitness.db`, gitignored),
  accessed via raw SQL (stdlib `sqlite3`) — no ORM.
- Styling: bare-bones HTML/CSS, in `fitness/static/style.css`.

## Data source

Garmin Connect, via the `garminconnect` Python library, with its own
authenticated session and token cache (own token path, not
`~/.garminconnect`).

## Refresh behavior

- A Sync button (`↻ Sync`, outlined in blue (Chart.js's series blue), light
  blue fill on hover, faded while syncing) at the right end of the nav
  (in `base.html`, so on every page) runs the same `fitness.sync.main()` as the CLI, which still
  works. Added 2026-10-26.
  - It is a `<form method="post">` to `/sync` (POST, not a GET link: a
    sync writes data, and a GET could be prefetched, reopened from
    history or re-run by a reload). A hidden `next` field carries
    `request.path`; after the sync the route redirects there, or to `/`
    if `next` isn't a local path (open-redirect guard,
    `is_local_path` in `app.py`).
  - The request blocks until the sync is done. `static/sync.js`
    (loaded at the end of `base.html`) disables the button and shows
    "Syncing…" on submit, so a second click can't start a second Garmin
    login and fetch.
  - No message on the page. A successful sync just reloads the page; a
    failed one isn't caught, so Flask shows its 500 page (traceback in
    the terminal), like the CLI raising. Chosen on 2026-10-26 over flash
    messages (a bar, then a toast, were built or mocked up) as not worth
    the code: no `flash`, no `secret_key`. Per-table counts stay in the
    terminal output (`print` in `sync/`).
- On failure the last-good data stays: `main()` commits once at the end,
  so a failed sync writes nothing.
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

## Deployment

Set up 2026-10-27: a Docker container on the home
Raspberry Pi 4 (`aarch64`), served at `fitness.oplab.uk` through the
existing remotely managed Cloudflare Tunnel (`cloudflared` as a systemd
service on the host).

- Login: HTTP basic auth, checked in a Flask `before_request` hook
  against credentials from `.env`. Chosen on 2026-10-27 over Cloudflare
  Access (no code, but harder to hand a link + credentials to a friend)
  and a Flask login page (most code, needs sessions and a `secret_key`).
  One shared pair, `APP_USER` / `APP_PASSWORD` (chosen over a separate
  guest pair, 2026-10-27): to revoke a guest, change the password.
  If either is unset, every request gets 401 (fails closed).
- Persistent state: `fitness.db` and `.token/` move into a gitignored
  `data/` folder at the project root, on the laptop and in the
  container alike; on the Pi, compose mounts the clone's own `./data`
  (create it as `pi` before the first `up`, or Docker creates it
  root-owned and user 1000 can't write). Chosen on 2026-10-27 over
  mounting the file and token dir at their old paths (a single-file
  SQLite mount leaves the journal outside the mount) and a `DATA_DIR`
  setting (one more knob); `./data` chosen over `/mnt/ssd/fitness`
  (same layout as the laptop, no dependency on the SSD being mounted).
- DB setup: the container's start command runs `python -m
  fitness.init_db` before gunicorn on every start (idempotent), so the
  Pi needs no manual step. Chosen on 2026-10-27 over a manual `init_db`
  on the Pi and an `ensure_schema()` in app/sync code; the laptop
  keeps the manual command, and the open decision in "Refresh
  behavior" stays open for it.
- Server: gunicorn, one process with `--threads 4` (gthread), so pages
  keep loading during a sync and the blocking `/sync` request isn't
  killed by the worker timeout (a sync takes a few seconds). Two
  overlapping syncs can fail with "database is locked"; accepted, as a
  failed sync writes nothing. `--no-control-socket`: gunicorn 26's
  control socket isn't used, and user 1000 has no home dir to put it in. Chosen on 2026-10-27 over one plain
  worker with a long timeout and multiple worker processes.
- Delivery: `~/Fitness-webapp` on the Pi is a clone of the public GitHub repo,
  with `Dockerfile` and `docker-compose.yml` in the repo; deploy with
  `git pull && docker compose up -d --build` (native ARM build on the
  Pi). Chosen on 2026-10-27 over building/pushing an image to a
  registry by hand or from GitHub Actions.
- Container: port 5000 published on `127.0.0.1` only (reached via the
  tunnel); `/etc/localtime` mounted read-only, since sync uses
  `date.today()` and the container would otherwise run on UTC.

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

`ON DELETE CASCADE` is used on the parent → child relationship
`strength_sets` → `strength_sessions`, where sets are meaningless
without their session.

### Fitness page (7 tables)

Shared refresh policy (all seven daily tables, via `find_daily_start_date` in
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
(not `acwr_ratio`: Garmin sometimes reports a status without a ratio),
`active_kcal` (`resting_kcal` is NOT NULL, so it can't signal missing
data — same reasoning as `sleep`).

Dense tables: `hrv`'s API omits days without data, so the sync fills them
in itself (`list_days_in_range` in `sync/common.py`); `training_load`'s API already
returns every day. Nulls render as gaps in the line charts.

Rolling averages: resting HR, HRV and weight are charted as daily dots
(no connecting line; 6 px, Chart.js's size, rather than ECharts' 10 px
default) plus a 7-day rolling-average line (`buildDailyAverageOption`
in `fitness.js`). The average is computed in Python
(`queries.daily.compute_rolling_average`, window `ROLLING_DAYS = 7`): for each stored
day, the mean of the non-null values in the 7 calendar days ending on it
(fewer values on sparse stretches, e.g. weight on days without a
weigh-in). 7 days matches Garmin's own 7-day HRV and resting-HR averages
and cuts the day-to-day jump by 70–85% (weight 0.44 → 0.14 kg, resting
HR 1.89 → 0.28 bpm, HRV 5.56 → 0.94 ms).

| Table | Columns | Shape | Fetch |
|---|---|---|---|
| `vo2max` | `calendar_date` (PK), `vo2max_precise_value` (NOT NULL) | Sparse — only days Garmin computed a value | `get_max_metrics_range` (whole range in one request; list of entries, value at `generic.vo2MaxPreciseValue`, entries with null `generic` or value skipped). The API has no rating (Poor…Superior) field (`maxMetCategory` is 0, not a rating), so the page shades the Cooper Institute bands Garmin uses, for men aged 30–39 (`VO2MAX_BANDS` in `fitness.js`: Fair 40.5, Good 44, Excellent 48.3, Superior 54; the same cut-offs as Garmin's manuals); switch to the 40–49 row at age 40. Bands in Garmin's gauge colours (2026-11-08, chosen over the earlier red/orange/yellow/green/blue by comparing both): Poor red, Fair orange, Good green, Excellent blue, Superior purple. The green highlight on EXCELLENT points was dropped (2026-11-08) as not needed: the band shows it. Drawn as 3 px filled dots on a 1.5 px line instead of ECharts' default hollow rings on a 2 px line (2026-11-08): the rings looked cartoonish, especially on a phone. Unlike ACWR the dots are kept, because the data is sparse and they show which days have a measurement |
| `resting_hr` | `calendar_date` (PK), `resting_hr_bpm` (NOT NULL) | Sparse — days without a reading are absent | `get_rhr_daily` (list of `{calendarDate, value}`; value is a float, rounded to int). The library documents a ~1-year limit per request, so the range is fetched in ≤365-day windows (`split_date_windows` in `sync/common.py`) — one request today; more only once a bootstrap spans over a year |
| `hrv` | `calendar_date` (PK), `hrv_value`, `hrv_status`, `baseline_low_upper`, `baseline_balanced_low`, `baseline_balanced_upper` (all nullable) | Dense — one row per day in range; null if no overnight reading | `get_hrv_data_range` → `hrvSummaries[i].lastNightAvg` (ms); missing days filled with null. The API rejects ranges over 366 days (400 error), so fetched in ≤365-day windows. Same response: `status` → `hrv_status` (`BALANCED`, `UNBALANCED`, `LOW`; Garmin's `NONE` while calibrating, the first 18 days, is stored as null, as for `training_load`), and `baseline.lowUpper` / `balancedLow` / `balancedUpper` → the three `baseline_*` columns (null while calibrating). Status is stored, not computed: the rule it follows (7-day average inside `balancedLow`–`balancedUpper`, edges included = BALANCED; outside = UNBALANCED; below `lowUpper` = LOW) matched all 99 days with a baseline but is inferred, not documented, LOW has never occurred, and recent days sit within 1 ms of the edge, where our own 7-day average (≤ 1.1 ms off Garmin's) could flip it. `weeklyAvg` and `baseline.markerValue` (Garmin's gauge position) are not stored. Page: the HRV chart draws the balanced range (green) and the strip down to `lowUpper` (yellow, dashed LOW limit) behind the dots and 7-day line, as stacked areas (`buildHrvBaselineSeries` in `fitness.js`, from `queries.daily.load_hrv_baseline` via `data-baseline`; ECharts has no fill between two lines); no legend (ECharts' default); 6 px filled dots on the 7-day line mark days whose Garmin status isn't BALANCED (UNBALANCED orange, LOW red; 3 so far: 2026-10-17, -20, -21; `buildHrvStatusSeries`), so status is read from the line, never from single dots. They replaced 14 px hollow rings (2026-11-08), which on a phone merged into one blob on the consecutive days 10-20 and 10-21; same size as ACWR's HIGH dots, so a coloured dot on a line means a status day on both charts. Compared against smaller rings, rings smaller on phones only, an orange segment of the 7-day line, and no markers; the tooltip names Garmin's status for the day. Since status follows the 7-day average, a single night outside the band (e.g. 93 ms on 2026-09-14, average 82 inside 67–83) is still BALANCED. Added 2026-10-23 (DB rebuilt; strength tables still empty) |
| `weight` | `calendar_date` (PK), `weight_kg` (NOT NULL) | Sparse — weigh-in days only; the chart line connects weigh-ins | `get_weight_snapshot` → `dateWeightList` (whole range in one request, no limit observed). `weight` is in grams → kg (2 dp). `sourceType == "USER_SETTING"` entries (the weight from Garmin profile settings, not a weigh-in) are skipped. Several weigh-ins on one day → latest by `timestampGMT`. Page: dots plus 7-day line, with the creatine marker (`WEIGHT_MARKERS`) as an ECharts `markLine`, its label running along the line inside the plot (`insideEndTop`) and no end symbols; chosen 2026-11-08 over a larger top margin, a horizontal label drawn with `graphic` and no label, since the default label sat on the subtitle |
| `sleep` | `calendar_date` (PK), `sleep_duration_minutes` (nullable), `sleep_need_minutes` (NOT NULL) | Sparse — recorded nights only (a missed night has no entry at all, so there's no need value to store; the chart shows no bar for it). Duration stays nullable in case Garmin sends a night with a need but no duration; none so far | `get_sleep_daily` → `values.totalSleepTimeInSeconds` (→ minutes, rounded) and `values.sleepNeed` (already minutes); entries without `sleepNeed` skipped. The library splits ranges into 28-day requests itself. Charted as one bar per night (`queries.daily.load_sleep_shortfall`): duration minus need, in minutes, pink (`#fb628b`) below zero (short of need), teal (`#3fbe95`) above — both from ECharts' default palette, chosen 2026-11-08 over the earlier tomato red/green and other palette pairs; plain default colours (one colour for all bars) were tried and rejected, as the sign should show in the colour — plus a 7-day rolling-average line on top (`queries.daily.compute_rolling_average`, as for resting HR/HRV/weight), in ECharts' default series colour. Each point also carries the night's sleep (`slept`, minutes), so the tooltip shows `-51 min (slept 6:59)` (`formatMinutes` in `fitness.js`) and the average (`7-day average: -68 min`). Replaces an earlier two-line chart (sleep, dashed sleep need, in hours): the need is ~470 min almost every night, so the flat need line added little, while the gap to it is what matters (short on 88 of 116 nights, by 63 min on average) |
| `training_load` | `calendar_date` (PK), `acwr_status`, `acute_load`, `chronic_load`, `acwr_ratio` (all nullable) | Dense — the API returns every day; all four columns nulled together when `acwrStatus == "NONE"` (onboarding, 06-28 to 07-03). `acwr_ratio` can also be null on days that do have a status (07-04 to 07-10); stored as Garmin reports it, not recomputed (Garmin's ratio isn't a plain acute/chronic division) | `get_weekly_training_status` → `reportData[<deviceId>][i].acuteTrainingLoadDTO`: `acwrStatus`, `dailyTrainingLoadAcute`, `dailyTrainingLoadChronic`, `dailyAcuteChronicWorkloadRatio`. Whole range in one request, no limit observed. Entries with `primaryTrainingDevice == false` skipped. Page: a line of the ratio (`plotAcwrChart`), with shaded status bands behind it (LOW < 0.8, OPTIMAL 0.8–1.5, HIGH ≥ 1.5; `ACWR_BANDS` in `fitness.js`). The cut-offs are inferred from the data — every stored status matches them — not from Garmin documentation; a VERY HIGH status (sports-science literature uses > 2.0) has never been observed, so it has no band yet. The y-axis reaches at least 1.7 (`getAcwrAxisMax`) so the HIGH band is always visible. Points with a ratio in the HIGH band (≥ 1.5, read from `ACWR_BANDS`) are drawn as 6 px red dots (`buildHighlightedPairs`); kept on 2026-11-08 after comparing with no highlight (unlike VO2max's). The other days have no point and the line is 1.5 px instead of the 2 px default (chosen 2026-11-08): with ~120 daily values, ECharts' default hollow rings overlapped into beads, worst on a phone; compared against small filled dots, smaller rings on phones, smoothed, step and daily dots plus 7-day average. Considered and not built (2026-10-25): a daily training-load bar chart under ACWR (per-activity `activityTrainingLoad`, stacked by type) to explain its peaks and dips — the ACWR chart is enough as it is |
| `calories` | `calendar_date` (PK), `active_kcal` (nullable), `resting_kcal` (NOT NULL) | Sparse — days without data are absent. Daily totals, not per activity (the activity list's `calories` / `bmrCalories` are not stored). Resting is BMR, estimated from the profile, so a null could only be a bug; active stays nullable in case Garmin sends a day with BMR but no movement data (none so far: 131 days from `FIRST_DATA_DATE` with both values, no gaps). The day in progress is partial (resting 1540 on 2026-11-05 vs. ~1830–1934 on full days) and is re-fetched by the shared policy | `get_calories_daily` (same wellness-stats endpoint as `get_rhr_daily`, metric IDs 22 active, 23 BMR; so ≤365-day windows, as for `resting_hr`) → `active`, `resting` (floats, always whole; rounded to int). The library's `total` (its own `active + resting`, with a missing value counted as 0) is not stored; total is derived when needed. Chosen over `get_daily_stats(…, "CALORIES")` (Garmin's own total, range limit untested) and per-day `get_user_summary` (one request per day) for consistency with `resting_hr`. Not charted yet (2026-11-06) |

### Running page (1 table)

Charts: pace (base-HR runs), metres per
heartbeat (all runs). The pace chart is drawn like VO2max: 3 px
filled dots on a 1.5 px line instead of ECharts' default hollow rings
(2026-11-08), since the runs are sparse and the dots show their dates. Metres per heartbeat (`queries.running.load_metres_per_beat`)
= speed in m/min ÷ average HR, one dot per run with HR, x = date; it
replaced a planned pace-vs-HR-by-location scatter, which with HR capped
just repeated the pace chart (base-HR runs all sit at 131–137 bpm in one
location), while metres per heartbeat across all runs shows the trend
for every run type (0.87–0.95 in early July, 0.99–1.07 in Sep–Oct).
Each point also carries name, location, type, pace, HR and weather for
the tooltip; the weather goes on a line below the date, rounded to whole
°C and %, and is left out for a run without a report.

All runs are one grey line with points (`buildAllRunsSeries`, legend
"All runs"), and three groups are drawn on top as 5 px coloured points in
ECharts' default colours (`HIGHLIGHTS` in `running.js`, matched on
`run_type`, else `location`): `Base-HR` (12 runs so far), `Threshold-HR`
(3) and `Laganas` (3; all Laganas runs are other types, so no run is in
two groups). Chosen 2026-11-08 over 3 groups (Base-HR, Free run, other
workouts), Base-HR alone, and one line with every point coloured by type
and no legend. It replaced one series per run type (7 colours, 7 legend
entries for 39 runs, 3 types with 1–2 runs) plus shapes for location,
which took 3 legend rows on a phone and needed extra tooltip code, since
an axis tooltip takes the nearest point of every series. Only the grey
line carries the tooltip, so it gives one run per date, as on the pace
chart; the run name still gives the type and location. Tapping the "All
runs" legend entry hides the grey line. Point sizes (2026-11-08): the grey
line is drawn like VO2max (3 px filled dots, 1.5 px line) instead of
ECharts' default hollow rings on a 1 px line, and the coloured points
went from 8 px, too big on a phone, to 5 px; with the hollow rings under
them, smaller coloured points looked faded, which the 3 px grey dots
avoid.

The legend sits below the plot in a compact style (10 px symbols, 11 px
text). ECharts reserves no room for a legend, so the bottom margin is set
by width with ECharts' `media` option: 75 px below 500 px wide (2 legend
rows on a phone), 55 px wider. On phones this chart is 260 px tall
(`.chart-legend`), not 200, to give the plot back the legend's room.
Chosen 2026-11-08 over the legend between subtitle and plot, a one-row
scrolling legend and no legend.

| Table | Columns | Notes |
|---|---|---|
| `runs` | `activity_id` (PK), `start_time_local`, `distance_m`, `duration_s`, `activity_name` (all NOT NULL), `avg_hr`, `location`, `run_type`, `temp_c`, `apparent_temp_c`, `relative_humidity` (nullable) | Every activity with `activityType == "running"` (all run types, not just base-HR). Fetch: `get_activities_by_date(start, end, "running")`, then the type check; `duration_s` = `duration`, `avg_hr` = `averageHR` rounded (nullable: a run recorded without HR is a legitimate state; none so far). `location` and `run_type` are parsed from the name at sync time by `parse_run_name` in `sync/running.py`, so the naming rule lives in one place — strict patterns, no keyword matching: `<Location> - <Type>`, split on the first ` - ` (spaces included), location before, type after, taken as-is; `<Location> Running` (Garmin's automatic name for a run nobody renamed, e.g. `Jeddah Running`) → location, type null (a free run), so forgetting to rename one costs nothing; anything else → both null (a treadmill run might come as `Treadmill Running` and parse as location "Treadmill" — none yet; rename it if it shows up). Hyphens inside the type are kept, so `Base-HR` (custom HR-capped workout) and `Base` (Garmin's suggested workout), and likewise `Threshold-HR` and `Threshold`, are distinct types. Names are fixed at the source, in Garmin Connect, and kept consistent (`Jeddah-Threshold-HR` on 2026-10-10 was renamed to `Jeddah - Threshold-HR`); `Laganas - Base` (2026-09-07, max HR 149) stays `Base` — Garmin's default workout, only under 150 because it was cooler. Base-HR charts select `WHERE run_type = BASE_HR_RUN_TYPE` (`"Base-HR"`, in `config.py`, shared by sync and queries). Pace is derived when charting (`duration_s / distance_m`, shown as `m:ss /km`), not stored. Weather: one `get_activity_weather(activity_id)` call per run in the fetched window, at sync time (so runs stored before these columns existed only get weather from a DB rebuild). It is the nearest station report to the run's start (≤ 25 min off on all 36 runs; Jeddah airport OEJN, Zakynthos LGZA for Laganas), not a watch sensor — the activity list has no temperature fields. `temp` and `apparentTemp` come in whole °F and are converted to °C with 1 decimal (like grams → kg for weights); `relativeHumidity` is a whole % as given. All three are kept, not just temperature, since they come in the same response (chosen 2026-10-30). All three nullable: a run with no report (e.g. treadmill; none so far) is a legitimate state. Refresh: start at `FIRST_DATA_DATE` if empty, else same calendar day as `MAX(start_time_local)` (not +1 day, to avoid missing a second same-day activity a prior refresh only partially caught); insert-if-not-exists by `activity_id` (`store_new`, `INSERT OR IGNORE`; the sync log shows runs found vs. new). Replaced an earlier `base_hr_runs` table that kept base-HR runs only (DB rebuilt on 2026-10-23, before any hand-entered data existed). |

### Strength page (2 tables)

| Table | Columns | Notes |
|---|---|---|
| `strength_sessions` | `activity_id` (PK), `start_time_local`, `workout_id`, `session_label` (all NOT NULL) | Every activity with `activityType == "strength_training"` **and** a `workoutId` (activities from one of your Garmin Connect workouts); free sessions without one are skipped. Fetch: `get_activities_by_date(start, end)` with no type filter, then the type check — `strength_training` is a sub-type, which the endpoint rejects as a filter (400 "Activity type cannot be an activity sub type"). `session_label` = the activity name as-is (e.g. `S1 Squats`): Garmin names each session after its workout, so the name is the session group, the same idea as `run_type` from run names. Chosen over a hand-entered `workout_sessions` lookup (`workoutId` → label): every workout's 7–8 sessions so far have one `workoutId` and one matching name, and the name needs no table, no seed file and survives rebuilds, while a new workout version (new `workoutId`) with the same name just continues the group. Renaming a workout starts a new group (rename old sessions in Garmin to merge); two different workouts with one name would merge. Refresh: as for `runs` — start at `FIRST_DATA_DATE` if empty, else same calendar day as `MAX(start_time_local)`; insert-if-not-exists by `activity_id` (no 30-day re-scan floor: there is no lookup table whose late registration could make a session be skipped). |
| `strength_sets` | `activity_id` (FK → `strength_sessions`, `ON DELETE CASCADE`), `set_index` (0-based, ACTIVE sets only), `category`, `reps` (NOT NULL), `name`, `weight_kg` (nullable); PK `(activity_id, set_index)` | Fetched once per session via `get_activity_exercise_sets`, filtered to `setType == "ACTIVE"`, taking `exercises[0]` (Garmin's top detected exercise); each sync fetches sets for every stored session that has none yet (`find_sessions_without_sets`). `weight` is in grams → kg (2 dp). `name` is nullable: Garmin sends only `category` on some sets (25 of 899: 13 pull-up, 12 crunch). `weight_kg` is nullable and stored as given: bodyweight sets come as `0`, `-0` or missing (2 sets). Charts count a missing or `-0` weight as 0 kg added. Names were made consistent at the source (see the strength page in "Pages"). |

## Code structure

Layout: a single `fitness/` package holds all code, `schema.sql`,
`templates/` and `static/`. The project root keeps only docs
(`SPEC.md`, `CLAUDE.md`), `requirements.txt`, the container files
(`Dockerfile`, `.dockerignore`, `docker-compose.yml`, see "Deployment"),
and gitignored local state (`.env`, `data/` holding `fitness.db` and
`.token/`, `.venv/`). No `src/` layout and no
`pyproject.toml` — the app isn't installed or distributed. Modules use
absolute imports (`from fitness.config import DB_PATH`) and are run from
the project root: `python -m fitness.init_db`, `python -m fitness.sync`,
`flask --app fitness.app run`. Split into subpackages only if one side
grows enough to warrant it — so far only `sync/` (see below).

All paths below are inside `fitness/`.

- Naming: functions start with a verb, one meaning each — `fetch_*`
  (Garmin API), `parse_*` (response → rows), `store_*` (DB write),
  `sync_*` (all three), `find_*` (DB lookup during sync), `load_*` (DB
  read for a chart), `compute_*` (a calculation), `build_*` (assemble a
  data structure), `format_*` (to display text); in JS `plot…` (draws a
  chart now), `get…` (a lookup), `build…`, `format…`. Exceptions: Flask route functions
  (`<page>_page`, `index`, `sync`), `main`, `init_app`. The JS follows the same
  style rules as the Python (no ternaries, explicit `for` loops instead
  of `.map`/`.filter`/`.forEach`, one `return` per function).
- `app.py` — Flask routes only. Flat, no application factory, no
  blueprints (not worth the overhead for 3 static pages with no auth and
  no test suite). Page route functions are named `<page>_page`
  (`fitness_page`, `running_page`, `strength_page`); that name is also
  the `url_for` endpoint. `sync` (POST `/sync`) runs the sync; see
  "Refresh behavior".
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
  reached ~340 lines across three pages; `common.py` holds the one
  helper shared across pages, `get_date_part` (timestamp → `YYYY-MM-DD`,
  used 4 times). In `strength.py`, the trend charts read sets via
  `load_strength_sets`; the tabs come from `list_session_labels`,
  `choose_group` picks the shown group (`find_latest_label` when none
  or an unknown one is asked for), and `filter_group_rows` →
  `build_exercise_trends` → `group_set_weights` build its charts.
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
  - `common.py` — `open_connection`, `find_activity_start_date`, `store_new`, `split_date_windows`, `list_days_in_range`.
  - `daily.py` — the seven fitness-page tables, `find_daily_start_date`, and
    the per-endpoint range limits (`RESTING_HR_MAX_DAYS`,
    `HRV_MAX_DAYS`, `CALORIES_MAX_DAYS`).
  - `running.py` — `runs`.
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
    upfront. Extracted so far: in `daily.py`, `find_daily_start_date`
    (refresh start for daily tables) and `store_daily(conn, table,
    columns, rows)` (writes daily rows); in `common.py`, `split_date_windows`
    (split long ranges for endpoints with a per-request limit),
    `list_days_in_range` (fill dense tables), and for the activity tables
    `find_activity_start_date(conn, table)` (refresh start: day of the latest
    `start_time_local`) and `store_new(conn, table, columns, rows)`
    (writes new activity rows; runs, strength sessions and sets). Fetch and parse stay per-table —
    they differ in endpoint and response shape — and so does each
    `sync_<table>`, which shows that table's specifics.
  - Storing: daily rows are written as insert-or-update
    (`INSERT ... ON CONFLICT (calendar_date) DO UPDATE`, a.k.a. "upsert")
    by `store_daily` — new days are added, existing days overwritten.
    Never `INSERT OR REPLACE` (it deletes first, which can fire
    cascades). Activity tables, which only add rows that don't exist
    yet, use `store_new` (`INSERT OR IGNORE`).
- Templates: `base.html` holds the shared skeleton (doctype, head, the
  stylesheet link, the ECharts CDN script, nav between the pages,
  the Sync button) with a `{% block content %}`; one template per page (`fitness.html`,
  `running.html`, `strength.html`) extends it. Templates contain no
  inline JS or CSS.
- Static files: `static/style.css` holds all styling. Layout: the page
  is capped at 1400 px (was 960, which left a laptop screen mostly
  margin). Fitness and running charts sit in `.chart-grid
  .chart-grid-large` (`auto-fill`, `minmax(min(480px, 100%), 1fr)`): 2
  per row on a laptop, 1 on a phone. Fitness charts are ordered in
  related pairs: sleep shortfall | weight, VO2max | ACWR, resting HR |
  HRV. The strength page's 280 px `.chart-grid` gets 4 columns at full
  width (3 before the cap was raised; wider charts, i.e. 3 per row, were
  compared and not taken, 2026-11-08). Below 600 px wide (phones)
  `.chart` is 200 px tall instead of 320 (was 400, then 280: still too
  tall; 200 is about the height of the Garmin app's phone charts), and
  the gap below each chart is 16 px instead of 32; the Efficiency Factor
  chart is 260 px (`.chart-legend`, see the running page). Fixed px
  rather than an aspect ratio: legends take a fixed height, so a ratio
  leaves the legend charts the least plot on narrow phones. The strength
  page's `.chart-small` is 220 px, and 200 px on phones too, to match the
  other pages. Its group tabs (`.tabs`, `.tab`) are underlined links,
  the shown group bold in blue (the active tab names the group). Chart
  titles are drawn by the chart (ECharts `title`, left as ECharts places
  it), not as `<h2>`/`<h3>` headings (2026-10-28), with a subtitle under
  each: the latest value and how long ago it was (`75.3 kg ·
  yesterday`), or for HRV Garmin's latest status, for ACWR the latest
  status band, and for strength the PR (2026-10-29). Units go in the
  title or subtitle; no y-axis titles, to give phones more plot width.

  One JS file per page (`static/fitness.js`, `static/running.js`,
  `static/strength.js`), loaded at the end of that page's template, plus
  `static/charts.js` with helpers shared by every page, loaded from
  `base.html` after ECharts; and `static/sync.js` for the nav's Sync
  button, loaded at the end of `base.html`. `charts.js` holds:
  - `buildChartOption(element, subtitleText)` — the frame every chart
    starts from: title and subtitle, the axis tooltip, the date axis,
    margins and y-axis; each chart adds its series and changes only what
    differs (pace's `m:ss` y labels, ACWR's 1.7 minimum, the Efficiency
    Factor legend and margins, strength's tooltip). Settings, all chosen
    2026-11-08 from side-by-side comparisons on the real data:
    - Tooltip `trigger: "axis"`: tapping anywhere shows the nearest
      date, and ECharts draws its vertical crosshair, which hides with
      the tooltip. A separate x-axis pointer was tried on the Efficiency
      Factor chart and dropped: on a touch screen nothing hides it, so
      it stayed after a tap. No horizontal crosshair (Chart.js's
      `CROSSHAIR_PLUGIN` option is gone).
    - `confine: true`, so a tooltip near a chart's edge stays inside the
      chart instead of running off a phone screen. Strength sets its own
      tooltip without it (its short tooltip hasn't been seen to
      overflow).
    - `grid: { top: 60, bottom: 30 }`: ECharts' default bottom margin
      (60) left an empty strip under each chart and a plot only ~80 px
      tall on a phone.
    - y-axis `scale: true` (not forced to start at 0, as before) and
      `splitNumber: 3` (about 3 intervals instead of ECharts' 5), so the
      labels don't crowd. The count still varies (about 3–8 labels)
      because ECharts rounds the step to 1, 2, 3 or 5 × 10ⁿ; accepted.
  - `buildDateAxis()` — the x-axis of every chart: ECharts' `time` axis
    with `minInterval` of 28 days, so it labels months only (its own
    choice mixed day ticks with month labels, which collided, e.g.
    "29" + "Sep"); chosen over hiding overlapping labels. Its
    `axisPointer.label.formatter` sets the tooltip's date header (also
    passed to custom tooltips as `axisValueLabel`), via `formatDate`:
    "Sat, Nov 7", fixed US English, not the phone's language (2026-11-08,
    chosen over "Nov 7, 2026", "Sat, Nov 7, 2026" and "Nov 7
    (yesterday)": the weekday helps with training, and the year adds
    little while the data spans months).
  - `plotChart(element, option)` — creates the chart and keeps it in
    `CHARTS`; one `resize` listener redraws them all, since ECharts
    doesn't follow its container's size by itself.
  - `buildPairs(points, key = "y")` — `{x, y}` points to the `[date,
    value]` pairs ECharts takes.
  - `STATUS_COLORS` / `getStatusColor(name, alpha)` — the status colours
    (green, yellow, orange, red, blue, purple) for bands, highlighted
    points and HRV's baseline and status dots. Series (lines, dots, strength's
    band, the Efficiency Factor highlights) keep ECharts' default
    colours. The green (75, 192, 92) and tomato red (255, 99, 71) were
    picked under Chart.js to differ from its teal and pink-red series
    colours; purple (153, 102, 255) was added for VO2max's Superior.
    Sleep's bars use two palette colours instead (see `sleep`).
  - `GREYS.guide` (25% black) for background edges (HRV's baseline).
  - Subtitles: `buildSubtitle(element, formatValue)` (latest value),
    `buildDatedSubtitle(point, formatPoint)`, with `findLatestPoint`,
    `countDaysAgo`, `formatDaysAgo`, `parseLocalDate` (a `YYYY-MM-DD`
    as a local date, not UTC midnight).
  - Bands: `isInBand`, `findBand`, `findBandForValue`, for
    `{ from, to, label, color }` bands (`null` = open-ended).

  In `fitness.js`: `buildDailyAverageOption` (dots + 7-day line: resting
  HR, weight, HRV), `buildMarkArea(bands, lowest, highest)` (labelled
  band shading with ECharts' `markArea`, label at the top-left; open
  ends set to a value far outside the data, which doesn't stretch the
  axis: VO2max 0/100, ACWR 0/10) and `buildMarkLine(markers)` (date
  markers). Markers are hand-written constants in the page's JS
  (`WEIGHT_MARKERS`: creatine 5 g/day from 2026-10-07), like
  `ACWR_BANDS`; move them to a table only if they multiply or are
  needed on several charts. Page-specific helpers (`ACWR_BANDS`,
  `VO2MAX_BANDS`, `formatMinutes`, `formatPace`) stay in the page's file
  until another page needs them — same "wait for real duplication"
  principle as `sync/`; the helpers above moved to `charts.js` once the
  same code was on all three pages.
- Chart data flow: a route calls `queries/`, which returns a plain
  Python data structure; the route passes it into the template context,
  and the template puts it on the chart's `<div>` (ECharts draws into a
  `<div>`, not a `<canvas>`) as a single-quoted
  `data-points='{{ ... | tojson }}'` attribute (Flask documents `tojson`
  as safe there). The page's JS file reads it with
  `JSON.parse(element.dataset.points)`. No Jinja inside `<script>`, so
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
  broadly across all tables or all 3 pages at once.
- First slice: `vo2max` — the simplest table (one API call, one value
  column, a single insert-or-update, a plain line chart), chosen specifically to
  prove the whole pipeline (auth, `db.py`, insert, route, chart) with
  minimal complexity before adding anything else.
- The Sync button was deferred while slices were built (`python -m
  fitness.sync` run from the terminal); added 2026-10-26, see "Refresh
  behavior".
- No ORM, no migration tooling — `schema.sql` is hand-edited directly as
  the schema evolves.
- Status: all six fitness-page slices done (`vo2max`, `resting_hr`,
  `hrv`, `weight`, `sleep`, `training_load`); `calories` sync done
  (2026-11-06), no chart planned for now; sync code
  split into the `sync/` package. Running page done, built in steps:
  1. done — base-HR runs sync + `/running` page with a pace chart;
  2. done, then dropped — duration and average heart-rate charts
     (see "Pages");
  3. done — `runs` table for all runs (replacing `base_hr_runs`), with
     `run_type`/`location` parsed from the name, and the all-runs
     metres-per-heartbeat chart (replacing the planned pace-vs-HR
     scatter);
  4. done, then dropped (2026-10-26) — `laps` sync + aerobic-decoupling
     chart (replaced the first pace-fade chart; see "Pages").

  Strength page: `strength_sessions` + `strength_sets` sync done (DB
  rebuilt on 2026-10-24, and again after the exercise names were fixed
  in Garmin on 2026-10-24 and 2026-10-29); a first-vs-latest bar chart was built and later removed
  (see "Pages"). Per-exercise trend
  charts (`queries.strength.build_exercise_trends()`,
  `plotExerciseTrendChart` in `strength.js`, a `.chart-grid` of
  `.chart-small` charts): done for all groups. The groups come from the
  data (every `session_label` with stored sets, sorted, so S1–S4 in
  order), like the exercises within them — a new workout shows up as a
  new tab by itself. One group per page with tabs and a default group
  (see "Pages"): done 2026-11-07.

  The nav in
  `base.html` only links pages that exist; it grows as pages are added.
