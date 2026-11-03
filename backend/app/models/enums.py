import enum


class UserRole(str, enum.Enum):
    student = "student"
    teacher = "teacher"
    staff = "staff"
    admin = "admin"


class UserStatus(str, enum.Enum):
    pending_approval = "pending_approval"      # teacher/staff sign-up waiting for an admin
    pending_enrollment = "pending_enrollment"  # approved, ID tag not linked yet
    active = "active"


class CategoryType(str, enum.Enum):
    book = "book"
    hardware = "hardware"


class EquipmentStatus(str, enum.Enum):
    available = "available"
    borrowed = "borrowed"
    overdue = "overdue"
    missing = "missing"


class EquipmentCondition(str, enum.Enum):
    good = "good"
    needs_maintenance = "needs_maintenance"
    damaged = "damaged"


class TransactionStatus(str, enum.Enum):
    borrowed = "borrowed"
    returned = "returned"
    overdue = "overdue"
    lost = "lost"


class NotificationType(str, enum.Enum):
    near_due = "near_due"
    overdue = "overdue"


class NotificationStatus(str, enum.Enum):
    sent = "sent"
    failed = "failed"


class EventType(str, enum.Enum):
    enroll = "enroll"
    scan = "scan"
    borrow = "borrow"
    return_ = "return"
    login = "login"
    tag_error = "tag_error"
    limit_reached = "limit_reached"


class EventResult(str, enum.Enum):
    success = "success"
    failed = "failed"


class PenaltyType(str, enum.Enum):
    overdue_fine = "overdue_fine"
    lost = "lost"
    damaged = "damaged"


class PenaltyStatus(str, enum.Enum):
    unpaid = "unpaid"
    paid = "paid"
    waived = "waived"
