from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, field_validator

from app.schemas.common import UtcDatetime
from app.services.tags import normalize_tag


class EnrollIn(BaseModel):
    sr_code: str
    user_uid: str          # the ID tag being linked to this account

    _tag = field_validator("user_uid")(lambda cls, v: normalize_tag(v))


class LoginIn(BaseModel):
    user_uid: str          # the user's ID tag, tapped to log in

    _tag = field_validator("user_uid")(lambda cls, v: normalize_tag(v))


class BorrowIn(BaseModel):
    item_uid: str          # who is borrowing comes from the kiosk's login session
    agreed: bool = False   # kiosk sends true after the user accepts the terms

    _tag = field_validator("item_uid")(lambda cls, v: normalize_tag(v))


class ReturnIn(BaseModel):
    item_uid: str

    _tag = field_validator("item_uid")(lambda cls, v: normalize_tag(v))


class LoginOut(BaseModel):
    ok: bool
    code: str
    message: str
    name: Optional[str] = None
    role: Optional[str] = None
    session_seconds: Optional[int] = None   # inactivity timeout, for the on-screen countdown


class ResultOut(BaseModel):
    ok: bool
    code: str
    message: str
    due_at: Optional[UtcDatetime] = None
    fine: Optional[int] = None


class PendingUser(BaseModel):
    sr_code: str
    full_name: str


class PendingUsersOut(BaseModel):
    users: List[PendingUser]


class EquipmentOut(BaseModel):
    ok: bool
    code: str
    message: str
    name: Optional[str] = None
    category: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None
    loan_days: Optional[int] = None
    requires_agreement: Optional[bool] = None


class ScanOut(BaseModel):
    """What a tapped tag is. kind is "user", "item" or null (unknown tag)."""
    ok: bool
    code: str
    message: str
    kind: Optional[str] = None
    name: Optional[str] = None
    role: Optional[str] = None
    category: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None
    loan_days: Optional[int] = None
    requires_agreement: Optional[bool] = None
