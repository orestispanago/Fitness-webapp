# CLAUDE.md

Personal, single-user Flask + SQLite app that charts Garmin Connect data.

## Read first

- `SPEC.md` is the source of truth for scope, schema, refresh policies,
  code structure and build order. Read it before any work.
- When a design decision changes, update `SPEC.md` (and `schema.sql` if
  the schema is affected) so it stays accurate.

## Working agreements

- Do not start developing (writing or changing app code) until the user
  explicitly says to. Discussing, planning and updating docs is fine.
- Build in vertical slices, one table at a time: fetch → insert → plot,
  working end to end before the next table. Current/first slice: `vo2max`.
- No premature abstraction: one function per table in `sync.py`, inline
  charts per page template, until real duplication shows up in 2–3 places.
- No ORM, no migrations, no JS frameworks, no JSON API — see `SPEC.md`.
- Ask when a request is ambiguous rather than guessing.

## Running

- Use the project venv: `.venv/bin/python`, `.venv/bin/pip`.
- Initialise the DB: `sqlite3 fitness.db < schema.sql` (idempotent).
- Sync data from Garmin: `.venv/bin/python sync.py` (manual for now).
- Run the app: `.venv/bin/flask --app app run` (localhost only).
- After adding a dependency, regenerate `requirements.txt` with
  `.venv/bin/pip freeze > requirements.txt`.
- Testing is manual: run the app and check the chart in a browser.

## Secrets and data

- Never commit, print or paste the contents of `.env` (Garmin credentials)
  or `.token/` (Garmin session tokens). Both are gitignored.
- `fitness.db` and raw Garmin API dumps contain personal data — keep them
  out of the repo.
