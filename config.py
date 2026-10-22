import os

from dotenv import load_dotenv

dirname = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(dirname, ".env"))

EMAIL = os.getenv("EMAIL")
PASSWORD = os.getenv("PASSWORD")
TOKEN_PATH = os.path.join(dirname, ".token")
