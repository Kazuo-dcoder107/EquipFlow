"""Create an admin account.

Usage (from backend/):  python -m scripts.create_admin <username> "<Full Name>" <email>
The username is what the admin types in the login page's SR-code field.
"""
import getpass
import sys

import app.models  # noqa: F401
from app.database import Base, SessionLocal, engine
from app.models import User, UserRole, UserStatus
from app.security import hash_password
from sqlalchemy import select

if len(sys.argv) != 4:
    sys.exit(__doc__)
username, full_name, email = sys.argv[1], sys.argv[2], sys.argv[3].lower()

Base.metadata.create_all(engine)
with SessionLocal() as db:
    if db.scalar(select(User.id).where((User.sr_code == username) | (User.email == email))):
        sys.exit("An account with that username or email already exists.")
    password = getpass.getpass("Password (min 8 characters): ")
    if len(password) < 8 or len(password.encode()) > 72:
        sys.exit("Password must be 8-72 characters.")
    if password != getpass.getpass("Repeat password: "):
        sys.exit("Passwords do not match.")
    db.add(User(sr_code=username, full_name=full_name, email=email, role=UserRole.admin,
                status=UserStatus.active, password_hash=hash_password(password)))
    db.commit()
print(f"Admin '{username}' created.")
