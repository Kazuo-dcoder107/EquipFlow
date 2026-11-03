from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import EquipmentCondition, TransactionStatus
from app.models.user import utcnow


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_id: Mapped[int] = mapped_column(ForeignKey("equipment.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    borrowed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    due_at: Mapped[datetime] = mapped_column(DateTime)
    returned_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    condition_on_return: Mapped[Optional[EquipmentCondition]] = mapped_column(
        Enum(EquipmentCondition), nullable=True
    )
    status: Mapped[TransactionStatus] = mapped_column(
        Enum(TransactionStatus), default=TransactionStatus.borrowed
    )
    # Set when the user accepts the terms at the kiosk (required for hardware)
    agreement_accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    user = relationship("User", back_populates="transactions")
    equipment = relationship("Equipment", back_populates="transactions")
    notifications = relationship("Notification", back_populates="transaction")
    penalties = relationship("Penalty", back_populates="transaction")
