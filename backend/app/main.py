import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.models  # noqa: F401  (registers the tables)
from app.config import CORS_ORIGINS, DEFAULT_SECRET_KEY, SCHEDULER_ENABLED, SECRET_KEY
from app.database import Base, engine
from app.scheduler import build_scheduler
from app.services.notifications import email_enabled
from app.routers import (auth, categories, dashboard, equipment, genres, incidents, kiosk, me,
                         notifications, penalties, reports, transactions, users)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if SECRET_KEY == DEFAULT_SECRET_KEY:
        logging.getLogger("uvicorn.error").warning(
            "SECRET_KEY is not set - using the insecure development key. "
            "Run: python -m scripts.init_env")
    Base.metadata.create_all(engine)
    log = logging.getLogger("uvicorn.error")
    if not email_enabled():
        log.warning("Email is not configured (SMTP_USER / SMTP_PASSWORD) - reminders will not be sent.")
    scheduler = build_scheduler() if SCHEDULER_ENABLED else None
    if scheduler:
        scheduler.start()
    yield
    if scheduler:
        scheduler.shutdown(wait=False)


app = FastAPI(title="EquipFlow API", lifespan=lifespan)
# Browsers on the two web sites send a bearer token (no cookies), so credentials stay off.
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"],
                   allow_headers=["Authorization", "Content-Type"])
app.include_router(kiosk.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(categories.router)
app.include_router(equipment.router)
app.include_router(genres.router)
app.include_router(transactions.router)
app.include_router(penalties.router)
app.include_router(incidents.router)
app.include_router(me.router)
app.include_router(dashboard.router)
app.include_router(reports.router)
app.include_router(notifications.router)
