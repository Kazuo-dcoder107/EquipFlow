import os
from pathlib import Path

from dotenv import load_dotenv

# Loads backend/.env if it exists. Real environment variables take priority over the file.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./equipment.db")

# The two web sites ("equipflow" for borrowers, "equipflow-admin" for admins) live on their
# own addresses, so the API only accepts browser requests from these origins. Comma-separated.
CORS_ORIGINS = [o.strip().rstrip("/") for o in os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001",
).split(",") if o.strip()]

# Kiosk login session: seconds of inactivity before the ID-tag login expires.
SESSION_TIMEOUT_SECONDS = int(os.getenv("SESSION_TIMEOUT_SECONDS", "30"))

# Teachers and staff: separate book rules (hardware rules stay the same as students').
FACULTY_BOOK_LOAN_DAYS = int(os.getenv("FACULTY_BOOK_LOAN_DAYS", "7"))
FACULTY_MAX_BOOKS = int(os.getenv("FACULTY_MAX_BOOKS", "4"))

# Signs login tokens. MUST be set to a long random value outside development.
DEFAULT_SECRET_KEY = "dev-only-change-me"
SECRET_KEY = os.getenv("SECRET_KEY") or DEFAULT_SECRET_KEY  # empty value counts as unset
ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "480"))

# Hours between UTC and local time; used when the admin filters history by date.
LOCAL_UTC_OFFSET_HOURS = int(os.getenv("LOCAL_UTC_OFFSET_HOURS", "8"))

# ---- Email notifications ----
# Emails are only sent when SMTP_USER and SMTP_PASSWORD are both set (for Gmail, use an
# "app password", not your normal password).
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").replace(" ", "")  # Google shows app passwords with spaces
SMTP_FROM = os.getenv("SMTP_FROM") or SMTP_USER
SMTP_SECURITY = os.getenv("SMTP_SECURITY", "starttls").lower()    # "starttls" (port 587) or "ssl" (port 465)

NEAR_DUE_HOURS = int(os.getenv("NEAR_DUE_HOURS", "24"))           # "due soon" reminder window
OVERDUE_REMINDER_DAYS = int(os.getenv("OVERDUE_REMINDER_DAYS", "1"))  # repeat overdue emails; 0 = send once
NOTIFY_INTERVAL_MINUTES = int(os.getenv("NOTIFY_INTERVAL_MINUTES", "60"))
SCHEDULER_ENABLED = os.getenv("SCHEDULER_ENABLED", "true").lower() not in ("0", "false", "no")
