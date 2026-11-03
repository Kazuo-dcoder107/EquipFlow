"""Two logins, one per web site, and public registration.

  * /login        - the borrower site (students, teachers, staff). Admin accounts are refused.
  * /admin/login  - the admin site. Only admin accounts are accepted.
A wrong-role attempt gets exactly the same error as a wrong password, so the responses
never reveal which accounts are admins."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserRole, UserStatus
from app.schemas.users import RegisterIn, TokenOut, UserOut
from app.security import create_access_token, get_current_user, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _authenticate(form: OAuth2PasswordRequestForm, db: Session, *, admin: bool,
                  error: str) -> TokenOut:
    # the form's "username" field carries the SR-code (admins use their admin username)
    user = db.scalar(select(User).where(User.sr_code == form.username.strip()))
    ok = verify_password(form.password, user.password_hash if user else None)
    if not (user and ok) or (user.role == UserRole.admin) != admin:
        raise HTTPException(status_code=401, detail=error,
                            headers={"WWW-Authenticate": "Bearer"})
    return TokenOut(access_token=create_access_token(user), role=user.role,
                    full_name=user.full_name)


@router.post("/login", response_model=TokenOut)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Borrower site login (students, teachers, staff)."""
    return _authenticate(form, db, admin=False, error="Incorrect SR-code or password")


@router.post("/admin/login", response_model=TokenOut)
def admin_login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Admin site login. Only admin accounts can sign in here."""
    return _authenticate(form, db, admin=True, error="Incorrect username or password")


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    """Public registration (student, teacher or staff). Students wait for their ID tag
    to be linked at the kiosk; teachers and staff first need an admin's approval."""
    if db.scalar(select(User.id).where(User.sr_code == body.sr_code)):
        raise HTTPException(status_code=409, detail="SR-code already registered")
    if db.scalar(select(User.id).where(User.email == body.email)):
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(sr_code=body.sr_code, full_name=body.full_name, email=body.email,
                role=body.role,
                status=(UserStatus.pending_approval if body.role != UserRole.student
                        else UserStatus.pending_enrollment),
                password_hash=hash_password(body.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:  # two identical sign-ups racing each other
        db.rollback()
        raise HTTPException(status_code=409, detail="SR-code or email already registered")
    return UserOut.from_user(user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return UserOut.from_user(user)
