from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import EventResult, EventType
from app.models.user import utcnow


class Kiosk(Base):
    __tablename__ = "kiosks"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    api_key: Mapped[str] = mapped_column(String(64), unique=True)
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    kiosk_id: Mapped[Optional[int]] = mapped_column(ForeignKey("kiosks.id"), nullable=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    equipment_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("equipment.id"), nullable=True
    )
    event_type: Mapped[EventType] = mapped_column(Enum(EventType))
    result: Mapped[EventResult] = mapped_column(Enum(EventResult))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
