from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import PenaltyStatus, PenaltyType
from app.models.user import utcnow


class Penalty(Base):
    __tablename__ = "penalties"

    id: Mapped[int] = mapped_column(primary_key=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    type: Mapped[PenaltyType] = mapped_column(Enum(PenaltyType))
    amount: Mapped[int]  # pesos
    status: Mapped[PenaltyStatus] = mapped_column(
        Enum(PenaltyStatus), default=PenaltyStatus.unpaid
    )
    notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    transaction = relationship("Transaction", back_populates="penalties")
