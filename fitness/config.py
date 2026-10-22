import os

from dotenv import load_dotenv

PACKAGE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(PACKAGE_DIR)
load_dotenv(os.path.join(PROJECT_ROOT, ".env"))

EMAIL = os.getenv("EMAIL")
PASSWORD = os.getenv("PASSWORD")
TOKEN_PATH = os.path.join(PROJECT_ROOT, ".token")
DB_PATH = os.path.join(PROJECT_ROOT, "fitness.db")
SCHEMA_PATH = os.path.join(PACKAGE_DIR, "schema.sql")
