from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import UserRole, UserStatus


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    sr_code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.student)
    # UID of the user's RFID/NFC ID tag; filled in when the tag is linked at the kiosk
    rfid_uid: Mapped[Optional[str]] = mapped_column(String(32), unique=True, index=True,
                                                    nullable=True)
    # False after an admin deactivates a lost tag (the UID is kept so the kiosk can say so)
    rfid_active: Mapped[bool] = mapped_column(default=True)
    status: Mapped[UserStatus] = mapped_column(
        Enum(UserStatus), default=UserStatus.pending_enrollment
    )
    # Used for web login (students, teachers, staff and admins)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    transactions = relationship("Transaction", back_populates="user")
