from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import User, UserRole, UserStatus
from app.schemas.common import UtcDatetime
from app.services.profile import profile_complete


def _clean(value: str, field: str, max_len: int) -> str:
    value = value.strip()
    if not value or len(value) > max_len:
        raise ValueError(f"{field} must be 1-{max_len} characters")
    return value


def _check_password(value: str) -> str:
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters")
    if len(value.encode()) > 72:
        raise ValueError("Password is too long (max 72 bytes)")
    return value


class RegisterIn(BaseModel):
    sr_code: str
    full_name: str
    email: EmailStr
    password: str
    role: UserRole = UserRole.student   # teachers/staff are held until an admin approves
    # Students must send all four of these; teachers and staff may send age and department
    age: Optional[int] = None
    department_id: Optional[int] = None
    year_level: Optional[int] = None
    program_id: Optional[int] = None

    _sr = field_validator("sr_code")(lambda cls, v: _clean(v, "SR-code", 20))
    _name = field_validator("full_name")(lambda cls, v: _clean(v, "Name", 120))
    _pw = field_validator("password")(lambda cls, v: _check_password(v))
    _mail = field_validator("email")(lambda cls, v: v.lower())

    @field_validator("role")
    @classmethod
    def _role(cls, v):
        if v == UserRole.admin:
            raise ValueError("Role must be student, teacher or staff")
        return v


class RejectIn(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=300)   # emailed to the person

    @field_validator("reason")
    @classmethod
    def _reason(cls, v):
        v = v.strip() if v else None
        return v or None


class ProfileIn(BaseModel):
    """What the person sends from the Profile page. The whole set is sent every time, so
    leaving something out means clearing it (the rules in services/profile.py still apply)."""
    age: Optional[int] = None
    department_id: Optional[int] = None
    year_level: Optional[int] = None
    program_id: Optional[int] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None

    @field_validator("full_name")
    @classmethod
    def _name(cls, v):
        return None if v is None else _clean(v, "Name", 120)

    @field_validator("email")
    @classmethod
    def _mail(cls, v):
        return None if v is None else v.lower()


class PasswordReset(BaseModel):
    new_password: str

    _pw = field_validator("new_password")(lambda cls, v: _check_password(v))


def _epoch(moment) -> Optional[int]:
    """Seconds since 1970 for a stored (UTC) datetime, or None."""
    if moment is None:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return int(moment.timestamp())


class UserOut(BaseModel):
    id: int
    sr_code: str
    full_name: str
    email: str
    role: UserRole
    status: UserStatus
    rfid_linked: bool
    rfid_active: bool
    has_avatar: bool = False
    avatar_version: Optional[int] = None   # changes with each new photo; used to refresh caches
    age: Optional[int] = None
    department_id: Optional[int] = None
    department: Optional[str] = None
    year_level: Optional[int] = None
    program_id: Optional[int] = None
    program: Optional[str] = None
    profile_complete: bool = True   # False for a student who has not filled in all four details
    created_at: UtcDatetime

    @classmethod
    def from_user(cls, u: User) -> "UserOut":
        return cls(id=u.id, sr_code=u.sr_code, full_name=u.full_name, email=u.email,
                   role=u.role, status=u.status,
                   rfid_linked=u.rfid_uid is not None, rfid_active=u.rfid_active,
                   has_avatar=u.avatar_updated_at is not None,
                   avatar_version=_epoch(u.avatar_updated_at),
                   age=u.age, department_id=u.department_id,
                   department=u.department.name if u.department else None,
                   year_level=u.year_level, program_id=u.program_id,
                   program=u.program.name if u.program else None,
                   profile_complete=profile_complete(u), created_at=u.created_at)


class UserListOut(BaseModel):
    total: int
    items: List[UserOut]


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole
    full_name: str
