import sqlite3

from flask import g

from fitness.config import DB_PATH


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(f"file:{DB_PATH}?mode=rw", uri=True)
        g.db.execute("PRAGMA foreign_keys = ON")
        g.db.row_factory = sqlite3.Row
    return g.db


def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_app(app):
    app.teardown_appcontext(close_db)
