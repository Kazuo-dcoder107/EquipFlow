"""Usage reports and analytics (admin)."""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.stats import UsageReport
from app.security import require_admin
from app.services.stats import usage_report

router = APIRouter(prefix="/api/reports", tags=["reports"], dependencies=[Depends(require_admin)])


@router.get("/usage", response_model=UsageReport)
def usage(from_date: Optional[date] = None, to_date: Optional[date] = None,
          top: int = Query(10, ge=1, le=100),
          heavy_use_threshold: int = Query(30, ge=1), db: Session = Depends(get_db)):
    """Most borrowed, frequently overdue, per-category use, peak hours and weekdays
    (local time) for loans borrowed in the date range, plus equipment that may need
    maintenance or replacement (whole history; `heavy_use_threshold` = borrows)."""
    return usage_report(db, from_date, to_date, top, heavy_use_threshold)
