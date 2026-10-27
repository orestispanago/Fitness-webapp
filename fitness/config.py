import os

from dotenv import load_dotenv

PACKAGE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(PACKAGE_DIR)
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

EMAIL = os.getenv("EMAIL")
PASSWORD = os.getenv("PASSWORD")
APP_USER = os.getenv("APP_USER")
APP_PASSWORD = os.getenv("APP_PASSWORD")
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
TOKEN_PATH = os.path.join(DATA_DIR, ".token")
DB_PATH = os.path.join(DATA_DIR, "fitness.db")
SCHEMA_PATH = os.path.join(PACKAGE_DIR, "schema.sql")

FIRST_DATA_DATE = "2026-06-28"

# run_type of the HR-capped base runs charted on their own (see SPEC.md)
BASE_HR_RUN_TYPE = "Base-HR"
