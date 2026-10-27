Proposed version

# Fitness-webapp

Personal Flask app that syncs my Garmin Connect data into a local SQLite database and plots long-term trends:

- **Fitness**: VO2max, resting HR, HRV, weight, sleep, training load (ACWR)
- **Running**: base-HR runs: pace, heart rate, pace fade, pace vs. HR by location
- **Strength**: progress per workout session group

> **Status:** early development. Only the VO2max chart exists so far; see
> "Build order" in [SPEC.md](SPEC.md).

## Setup

Requires Python 3.14.

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Create a `.env` file in the project root with your Garmin Connect credentials:

```plaintext
EMAIL=you@example.com
PASSWORD=your-password
APP_USER=choose-a-username
APP_PASSWORD=choose-a-password
```

`APP_USER` / `APP_PASSWORD` are the app's own login (HTTP basic auth); without them every page answers 401.

The database and Garmin session tokens live in `data/` (`data/fitness.db`, `data/.token/`), so later runs don't need to log in again.

## Usage

Run from the project root:

```bash
.venv/bin/python -m fitness.init_db     # create the database (once)
.venv/bin/python -m fitness.sync        # fetch new data from Garmin Connect
.venv/bin/flask --app fitness.app run   # open http://127.0.0.1:5000

```

Re-run `sync` whenever you want fresh data. It only fetches what's new.

## Docker

`docker-compose.yml` runs the app with gunicorn on `127.0.0.1:5000`, with `./data` mounted as its `data/` and settings from `.env`. Create `data/` as your own user (UID 1000) before the first start, or Docker creates it owned by root:

```bash
docker compose up -d --build
```

The container creates the database on start. See "Deployment" in [SPEC.md](SPEC.md).

## Disclaimer

Uses the unofficial `garminconnect` library. Not affiliated with or endorsed by Garmin.
