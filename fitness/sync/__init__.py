from fitness.garmin_client import get_client
from fitness.sync import daily, running
from fitness.sync.common import open_connection


def main():
    client = get_client()
    conn = open_connection()
    try:
        daily.sync_all(conn, client)
        running.sync_all(conn, client)
        conn.commit()
    finally:
        conn.close()
