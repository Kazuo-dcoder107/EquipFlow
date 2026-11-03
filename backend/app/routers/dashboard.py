"""Admin dashboard numbers."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.stats import DashboardStats
from app.security import require_admin
from app.services.stats import dashboard_stats

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"],
                   dependencies=[Depends(require_admin)])


@router.get("/stats", response_model=DashboardStats)
def stats(overdue_limit: int = Query(10, ge=1, le=100), db: Session = Depends(get_db)):
    """Equipment counts per status, user and penalty totals, today's activity, and the
    most overdue loans. Statuses are refreshed first, so overdue is always current."""
    return dashboard_stats(db, overdue_limit)
