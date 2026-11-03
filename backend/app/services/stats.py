"""Dashboard numbers and usage analytics."""
import math
from collections import defaultdict
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.config import LOCAL_UTC_OFFSET_HOURS
from app.models import (Equipment, EquipmentCondition, EquipmentStatus, Penalty, PenaltyStatus,
                        PenaltyType, Transaction, TransactionStatus, User, UserRole, UserStatus)
from app.schemas.stats import (CategoryUsage, DashboardStats, HourCount, ItemUsage, MaintenanceFlag,
                               OverdueItem, PenaltyCounts, Period, StatusCounts, Summary,
                               TodayCounts, UsageReport, UserCounts, WeekdayCount)
from app.services.borrowing import _now
from app.services.overdue import sync_overdue
from app.services.records import _local_day_start_utc, fine_for, state_clause

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def dashboard_stats(db: Session, overdue_limit: int = 10) -> DashboardStats:
    sync_overdue(db)
    now = _now()

    by_status = dict(db.execute(select(Equipment.status, func.count())
                                .group_by(Equipment.status)).all())
    get = lambda s: by_status.get(s, 0)
    equipment = StatusCounts(
        total=sum(by_status.values()), available=get(EquipmentStatus.available),
        borrowed=get(EquipmentStatus.borrowed), overdue=get(EquipmentStatus.overdue),
        missing=get(EquipmentStatus.missing))

    by_user = dict(db.execute(select(User.status, func.count()).where(User.role != UserRole.admin)
                              .group_by(User.status)).all())
    enrolled, pending = by_user.get(UserStatus.active, 0), by_user.get(UserStatus.pending_enrollment, 0)
    awaiting = by_user.get(UserStatus.pending_approval, 0)
    users = UserCounts(students=enrolled + pending + awaiting, enrolled=enrolled,
                       pending_enrollment=pending, pending_approval=awaiting)

    unpaid_count, unpaid_total = db.execute(
        select(func.count(Penalty.id), func.coalesce(func.sum(Penalty.amount), 0))
        .where(Penalty.status == PenaltyStatus.unpaid)).one()

    today = (now + timedelta(hours=LOCAL_UTC_OFFSET_HOURS)).date()
    start, end = _local_day_start_utc(today), _local_day_start_utc(today + timedelta(days=1))
    borrows = db.scalar(select(func.count()).select_from(Transaction)
                        .where(Transaction.borrowed_at >= start, Transaction.borrowed_at < end))
    returns = db.scalar(select(func.count()).select_from(Transaction)
                        .where(Transaction.returned_at >= start, Transaction.returned_at < end))

    rows = db.scalars(
        select(Transaction).where(state_clause("overdue", now))
        .options(selectinload(Transaction.equipment).selectinload(Equipment.category),
                 selectinload(Transaction.user))
        .order_by(Transaction.due_at.asc(), Transaction.id).limit(overdue_limit)).all()
    overdue_items = [OverdueItem(
        transaction_id=t.id, equipment_id=t.equipment_id, equipment_name=t.equipment.name,
        category=t.equipment.category.name, sr_code=t.user.sr_code, full_name=t.user.full_name,
        due_at=t.due_at, days_overdue=math.ceil((now - t.due_at).total_seconds() / 86400),
        fine=fine_for(t, now)) for t in rows]

    return DashboardStats(equipment=equipment, users=users,
                          penalties=PenaltyCounts(unpaid_count=unpaid_count, unpaid_total=unpaid_total),
                          today=TodayCounts(borrows=borrows, returns=returns),
                          overdue_items=overdue_items)


def _is_late(tx: Transaction, now) -> bool:
    if tx.status == TransactionStatus.lost:
        return False
    if tx.returned_at is not None:
        return tx.returned_at > tx.due_at
    return tx.due_at < now


def usage_report(db: Session, from_date: Optional[date] = None, to_date: Optional[date] = None,
                 top: int = 10, heavy_use_threshold: int = 30) -> UsageReport:
    """Usage analytics over transactions borrowed in [from_date, to_date] (local days).
    Peak periods use local time. Maintenance flags look at the whole history."""
    now = _now()
    q = select(Transaction).options(selectinload(Transaction.equipment).selectinload(Equipment.category))
    if from_date:
        q = q.where(Transaction.borrowed_at >= _local_day_start_utc(from_date))
    if to_date:
        q = q.where(Transaction.borrowed_at < _local_day_start_utc(to_date + timedelta(days=1)))
    txs = db.scalars(q).all()

    per_item = defaultdict(lambda: {"borrows": 0, "late": 0})
    per_cat = defaultdict(lambda: {"borrows": 0, "returned": 0, "days": 0.0})
    by_hour, by_weekday = [0] * 24, [0] * 7
    returned = returned_late = 0
    held_days = 0.0
    for t in txs:
        item, cat = t.equipment, t.equipment.category
        per_item[item.id]["borrows"] += 1
        per_item[item.id]["late"] += _is_late(t, now)
        per_cat[cat.id]["borrows"] += 1
        local = t.borrowed_at + timedelta(hours=LOCAL_UTC_OFFSET_HOURS)
        by_hour[local.hour] += 1
        by_weekday[local.weekday()] += 1
        if t.returned_at is not None:
            returned += 1
            returned_late += t.returned_at > t.due_at
            days = (t.returned_at - t.borrowed_at).total_seconds() / 86400
            held_days += days
            per_cat[cat.id]["returned"] += 1
            per_cat[cat.id]["days"] += days

    items = {t.equipment_id: t.equipment for t in txs}
    usage = [ItemUsage(equipment_id=i, name=items[i].name, category=items[i].category.name,
                       borrow_count=s["borrows"], late_count=s["late"],
                       late_rate=round(100 * s["late"] / s["borrows"], 1))
             for i, s in per_item.items()]
    most_borrowed = sorted(usage, key=lambda u: (-u.borrow_count, u.name))[:top]
    frequently_overdue = sorted((u for u in usage if u.late_count),
                                key=lambda u: (-u.late_count, -u.late_rate, u.name))[:top]

    cats = {t.equipment.category.id: t.equipment.category for t in txs}
    by_category = sorted((CategoryUsage(
        category_id=cid, name=cats[cid].name, type=cats[cid].type, borrow_count=s["borrows"],
        avg_loan_days=round(s["days"] / s["returned"], 2) if s["returned"] else None)
        for cid, s in per_cat.items()), key=lambda c: (-c.borrow_count, c.name))

    summary = Summary(
        total_borrows=len(txs), returned=returned, returned_late=returned_late,
        on_time_rate=round(100 * (returned - returned_late) / returned, 1) if returned else None,
        avg_loan_days=round(held_days / returned, 2) if returned else None)

    return UsageReport(
        period=Period(from_date=from_date, to_date=to_date), summary=summary,
        most_borrowed=most_borrowed, frequently_overdue=frequently_overdue,
        by_category=by_category,
        by_hour=[HourCount(hour=h, count=c) for h, c in enumerate(by_hour)],
        by_weekday=[WeekdayCount(weekday=WEEKDAYS[i], count=c) for i, c in enumerate(by_weekday)],
        maintenance=_maintenance_flags(db, heavy_use_threshold))


def _maintenance_flags(db: Session, heavy_use_threshold: int):
    total_borrows = dict(db.execute(select(Transaction.equipment_id, func.count())
                                    .group_by(Transaction.equipment_id)).all())
    damage_reports = dict(db.execute(
        select(Transaction.equipment_id, func.count(Penalty.id))
        .join(Penalty, Penalty.transaction_id == Transaction.id)
        .where(Penalty.type == PenaltyType.damaged).group_by(Transaction.equipment_id)).all())
    flags = []
    for item in db.scalars(select(Equipment).options(selectinload(Equipment.category))):
        borrows, damages = total_borrows.get(item.id, 0), damage_reports.get(item.id, 0)
        reasons = []
        if item.condition == EquipmentCondition.damaged:
            reasons.append("damaged")
        if item.condition == EquipmentCondition.needs_maintenance:
            reasons.append("needs_maintenance")
        if damages >= 2:
            reasons.append("repeated_damage")
        if borrows >= heavy_use_threshold:
            reasons.append("heavy_use")
        if reasons:
            flags.append(MaintenanceFlag(
                equipment_id=item.id, name=item.name, category=item.category.name,
                condition=item.condition, total_borrows=borrows, damage_reports=damages,
                reasons=reasons))
    return sorted(flags, key=lambda f: (-len(f.reasons), f.name))
