"""Register a kiosk and print its API key.

Usage (from backend/):  python -m scripts.create_kiosk "Library Kiosk"
"""
import secrets
import sys

import app.models  # noqa: F401
from app.database import Base, SessionLocal, engine
from app.models import Kiosk

Base.metadata.create_all(engine)
name = sys.argv[1] if len(sys.argv) > 1 else "Kiosk 1"
key = secrets.token_hex(16)
with SessionLocal() as db:
    db.add(Kiosk(name=name, api_key=key))
    db.commit()
print(f"Kiosk '{name}' created.\nAPI key (put this in the ESP32 firmware): {key}")
