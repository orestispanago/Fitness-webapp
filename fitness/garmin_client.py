from garminconnect import Garmin

from fitness.config import EMAIL, PASSWORD, TOKEN_PATH


def get_client():
    client = Garmin(EMAIL, PASSWORD)
    client.login(TOKEN_PATH)
    return client
