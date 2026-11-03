from typing import List, Optional

from pydantic import BaseModel, EmailStr

from app.models import Notification, NotificationStatus, NotificationType
from app.schemas.common import UtcDatetime


class NotificationOut(BaseModel):
    id: int
    user_id: int
    sr_code: str
    full_name: str
    equipment_name: str
    type: NotificationType
    status: NotificationStatus
    sent_at: UtcDatetime


class NotificationListOut(BaseModel):
    total: int
    items: List[NotificationOut]


class RunOut(BaseModel):
    email_configured: bool
    near_due_sent: int = 0
    overdue_sent: int = 0
    failed: int = 0


class TestEmailIn(BaseModel):
    to: Optional[EmailStr] = None  # default: the admin's own address


class TestEmailOut(BaseModel):
    ok: bool
    sent_to: str


def notification_out(n: Notification) -> NotificationOut:
    tx = n.transaction
    return NotificationOut(id=n.id, user_id=n.user_id, sr_code=tx.user.sr_code,
                           full_name=tx.user.full_name, equipment_name=tx.equipment.name,
                           type=n.type, status=n.status, sent_at=n.sent_at)
