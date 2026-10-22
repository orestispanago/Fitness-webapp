import sqlite3

from fitness.config import DB_PATH, SCHEMA_PATH


def read_schema():
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        schema = f.read()
    return schema


def main():
    schema = read_schema()
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(schema)
    finally:
        conn.close()
    print(f"Schema applied to {DB_PATH}")


if __name__ == "__main__":
    main()
