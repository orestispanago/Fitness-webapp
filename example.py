import json

from garminconnect import Garmin

from config import EMAIL, PASSWORD, TOKEN_PATH

client = Garmin(EMAIL, PASSWORD)
client.login(TOKEN_PATH)


data = client.get_activities_by_date("2025-10-19", "2026-10-19")

with open("get_activities_by_date.json", "w", encoding="utf-8") as f:
    json.dump(data, f, indent=4)
