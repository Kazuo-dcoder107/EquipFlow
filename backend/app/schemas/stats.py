from datetime import date
from typing import List, Optional

from pydantic import BaseModel

from app.models import CategoryType, EquipmentCondition
from app.schemas.common import UtcDatetime


# ---------- dashboard ----------

class StatusCounts(BaseModel):
    total: int
    available: int
    borrowed: int   # out and not yet past due
    overdue: int
    missing: int


class UserCounts(BaseModel):
    students: int
    enrolled: int
    pending_enrollment: int
    pending_approval: int = 0


class PenaltyCounts(BaseModel):
    unpaid_count: int
    unpaid_total: int  # pesos


class TodayCounts(BaseModel):
    borrows: int
    returns: int


class OverdueItem(BaseModel):
    transaction_id: int
    equipment_id: int
    equipment_name: str
    category: str
    sr_code: str
    full_name: str
    due_at: UtcDatetime
    days_overdue: int
    fine: int  # pesos so far


class DashboardStats(BaseModel):
    equipment: StatusCounts
    users: UserCounts
    penalties: PenaltyCounts
    today: TodayCounts
    overdue_items: List[OverdueItem]  # most overdue first


# ---------- usage report ----------

class Period(BaseModel):
    from_date: Optional[date] = None
    to_date: Optional[date] = None


class Summary(BaseModel):
    total_borrows: int
    returned: int
    returned_late: int
    on_time_rate: Optional[float] = None   # % of returned loans that were on time
    avg_loan_days: Optional[float] = None  # over returned loans


class ItemUsage(BaseModel):
    equipment_id: int
    name: str
    category: str
    borrow_count: int
    late_count: int
    late_rate: float  # %


class CategoryUsage(BaseModel):
    category_id: int
    name: str
    type: CategoryType
    borrow_count: int
    avg_loan_days: Optional[float] = None


class HourCount(BaseModel):
    hour: int
    count: int


class WeekdayCount(BaseModel):
    weekday: str
    count: int


class MaintenanceFlag(BaseModel):
    equipment_id: int
    name: str
    category: str
    condition: EquipmentCondition
    total_borrows: int
    damage_reports: int
    reasons: List[str]  # damaged | needs_maintenance | repeated_damage | heavy_use


class UsageReport(BaseModel):
    period: Period
    summary: Summary
    most_borrowed: List[ItemUsage]
    frequently_overdue: List[ItemUsage]
    by_category: List[CategoryUsage]
    by_hour: List[HourCount]
    by_weekday: List[WeekdayCount]
    maintenance: List[MaintenanceFlag]
