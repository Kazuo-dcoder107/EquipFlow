import re
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from app.models import CategoryType, EquipmentCondition, EquipmentStatus
from app.schemas.common import UtcDatetime
from app.services.tags import normalize_tag


def _text(value: str, field: str, max_len: int) -> str:
    value = value.strip()
    if not value or len(value) > max_len:
        raise ValueError(f"{field} must be 1-{max_len} characters")
    return value


def _tag(value: str) -> str:
    value = normalize_tag(value)
    if not re.fullmatch(r"[A-Z0-9]{4,32}", value):
        raise ValueError("Tag UID must be 4-32 letters/digits (e.g. 04A1B2C3)")
    return value


# ---------- categories ----------

class CategoryIn(BaseModel):
    name: str
    type: CategoryType
    loan_days: int = Field(ge=1, le=365)
    fine_per_day: int = Field(ge=0, le=10000)  # pesos

    _name = field_validator("name")(lambda cls, v: _text(v, "Name", 80))


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[CategoryType] = None
    loan_days: Optional[int] = Field(default=None, ge=1, le=365)
    fine_per_day: Optional[int] = Field(default=None, ge=0, le=10000)

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        return None if v is None else _text(v, "Name", 80)


class CategoryOut(BaseModel):
    id: int
    name: str
    type: CategoryType
    loan_days: int
    fine_per_day: int
    equipment_count: int


# ---------- genres ----------

class GenreIn(BaseModel):
    name: str

    _name = field_validator("name")(lambda cls, v: _text(v, "Name", 60))


class GenreOut(BaseModel):
    id: int
    name: str
    book_count: int


# ---------- equipment ----------

class EquipmentIn(BaseModel):
    tag_uid: str
    name: str
    category_id: int
    genre_id: Optional[int] = None   # books only
    replacement_cost: int = Field(default=0, ge=0, le=1_000_000)  # pesos
    condition: EquipmentCondition = EquipmentCondition.good

    _tag = field_validator("tag_uid")(lambda cls, v: _tag(v))
    _name = field_validator("name")(lambda cls, v: _text(v, "Name", 120))


class EquipmentUpdate(BaseModel):
    tag_uid: Optional[str] = None
    name: Optional[str] = None
    category_id: Optional[int] = None
    genre_id: Optional[int] = None   # send null to clear it
    replacement_cost: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    condition: Optional[EquipmentCondition] = None

    @field_validator("tag_uid")
    @classmethod
    def _tag(cls, v):
        return None if v is None else _tag(v)

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        return None if v is None else _text(v, "Name", 120)


class EquipmentOut(BaseModel):
    id: int
    name: str
    category_id: int
    category: str
    type: CategoryType
    genre_id: Optional[int] = None
    genre: Optional[str] = None
    status: EquipmentStatus
    condition: EquipmentCondition
    tag_uid: Optional[str] = None           # admin only (return is tag-only, so
    replacement_cost: Optional[int] = None  # students never see the UID)
    created_at: UtcDatetime


class EquipmentListOut(BaseModel):
    total: int
    items: List[EquipmentOut]
