from fitness.garmin_client import get_client
from fitness.sync import daily, running, strength
from fitness.sync.common import fetch_all_activities, open_connection


def main():
    client = get_client()
    conn = open_connection()
    try:
        daily.sync_all(conn, client)
        # One read of the whole activity list, shared by runs and strength
        activities = fetch_all_activities(client)
        running.sync_all(conn, client, activities)
        strength.sync_all(conn, client, activities)
        conn.commit()
    finally:
        conn.close()
