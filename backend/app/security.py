from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, Header, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import ACCESS_TOKEN_MINUTES, SECRET_KEY
from app.database import get_db
from app.models import Kiosk, User, UserRole


# ---------- Kiosk (ESP32) authentication ----------

def get_kiosk(x_api_key: Optional[str] = Header(default=None),
              db: Session = Depends(get_db)) -> Kiosk:
    """Authenticate an ESP32 kiosk by its X-API-Key header."""
    kiosk = db.scalar(select(Kiosk).where(Kiosk.api_key == x_api_key)) if x_api_key else None
    if kiosk is None:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    kiosk.last_seen = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    return kiosk


# ---------- Web login (admins and students) ----------

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
_DUMMY_HASH = bcrypt.hashpw(b"dummy", bcrypt.gensalt())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: Optional[str]) -> bool:
    """Always does one bcrypt check, so unknown users cost the same time."""
    try:
        ok = bcrypt.checkpw(password.encode(), password_hash.encode() if password_hash else _DUMMY_HASH)
    except ValueError:  # e.g. password longer than bcrypt's 72-byte limit
        return False
    return ok and password_hash is not None


def create_access_token(user: User) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES)
    return jwt.encode({"sub": str(user.id), "exp": expires}, SECRET_KEY, algorithm="HS256")


def get_current_user(token: str = Depends(oauth2_scheme),
                     db: Session = Depends(get_db)) -> User:
    unauthorized = HTTPException(status_code=401, detail="Invalid or expired token",
                                 headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user = db.get(User, int(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        raise unauthorized
    if user is None:
        raise unauthorized
    return user  # role is read from the database, so role changes apply immediately


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
