"""Create backend/.env with a fresh random SECRET_KEY.
Never overwrites an existing .env.

Usage (from backend/):  python -m scripts.init_env
"""
import os
import secrets
import sys
from pathlib import Path

env = Path(__file__).resolve().parent.parent / ".env"
if env.exists():
    sys.exit(f"{env} already exists - leaving it untouched.")
env.write_text(f"SECRET_KEY={secrets.token_hex(32)}\n")
try:
    os.chmod(env, 0o600)  # owner-only where the OS supports it
except OSError:
    pass
print(f"Created {env} with a new SECRET_KEY. Keep this file private and out of Git.")
