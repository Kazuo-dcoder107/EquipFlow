from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import NotificationStatus, NotificationType
from app.models.user import utcnow


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id"), index=True)
    type: Mapped[NotificationType] = mapped_column(Enum(NotificationType))
    status: Mapped[NotificationStatus] = mapped_column(Enum(NotificationStatus))
    sent_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    transaction = relationship("Transaction", back_populates="notifications")
