# CLAUDE.md

Personal, single-user Flask + SQLite app that charts Garmin Connect data.

## Read first

- `SPEC.md` is the source of truth for scope, schema, refresh policies,
  code structure and build order. Read it before any work.
- When a design decision changes, update `SPEC.md` (and
  `fitness/schema.sql` if the schema is affected) so it stays accurate.

## Working agreements

- Do not start developing (writing or changing app code) until the user
  explicitly says to. Discussing, planning and updating docs is fine.
- Build in vertical slices, one table at a time: fetch → insert → plot,
  working end to end before the next table. Progress is tracked under
  "Build order" in `SPEC.md`.
- No premature abstraction: one function per table in `sync/<page>.py`, one JS
  file per page in `static/`, until real duplication shows up in 2–3
  places.
- No inline JS/CSS and no Jinja inside `<script>`: chart data goes on the
  `<canvas>` as `data-points='{{ ... | tojson }}'` (see `SPEC.md`).
- No ORM, no migrations, no JS frameworks, no JSON API — see `SPEC.md`.
- Ask when a request is ambiguous rather than guessing.
- Design decisions: one at a time. Show the options with pros and cons
  grounded in real data (actual API responses, observed quirks) and ask;
  never assume, even when a default seems obvious. For each option, say
  which has simpler code and which is more consistent with the existing
  code. Ask in plain text, not with the multiple-choice question tool.
- `SPEC.md` records decisions once they are made; don't write it ahead of
  them.
- Keep code comments minimal: don't repeat rationale `SPEC.md` already
  holds; at most point to it.
- The schema stores what the API gives, nulls included. Whether a missing
  value shows as 0, a gap, or is excluded is decided in the chart code.
- NOT NULL: decide by what a null would mean, not by "every value so far
  was non-null". Use it when a null could only mean a bug (impossible at
  the source, or a downstream query would silently go wrong). If a null is
  a legitimate state (e.g. no added weight on a bodyweight exercise), make
  the column nullable.

## Running

- Use the project venv: `.venv/bin/python`, `.venv/bin/pip`.
- All code lives in the `fitness/` package; run everything from the
  project root as modules, with absolute imports (`from fitness.db import
  get_db`).
- Create/update the DB schema: `.venv/bin/python -m fitness.init_db`
  (idempotent; run once, and again after editing `fitness/schema.sql`).
- Sync data from Garmin: `.venv/bin/python -m fitness.sync` (manual for
  now). It fails if `fitness.db` doesn't exist yet — run `init_db` first.
- Run the app: `.venv/bin/flask --app fitness.app run` (localhost only).
- After adding a dependency, regenerate `requirements.txt` with
  `.venv/bin/pip freeze > requirements.txt`.
- Testing is manual: run the app and check the chart in a browser.

## Secrets and data

- Never commit, print or paste the contents of `.env` (Garmin credentials)
  or `.token/` (Garmin session tokens). Both are gitignored.
- `fitness.db` and raw Garmin API dumps contain personal data — keep them
  out of the repo.
