
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import CategoryType, EquipmentCondition, EquipmentStatus
from app.models.user import utcnow


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    type: Mapped[CategoryType] = mapped_column(Enum(CategoryType))
    loan_days: Mapped[int]
    fine_per_day: Mapped[int] = mapped_column(default=0)

    equipment = relationship("Equipment", back_populates="category")


class Genre(Base):
    """Managed list of book genres."""
    __tablename__ = "genres"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60), unique=True)

    equipment = relationship("Equipment", back_populates="genre")


class AssetNumberSequence(Base):
    """Stores the last assigned asset number for each prefix."""
    __tablename__ = "asset_number_sequences"

    prefix: Mapped[str] = mapped_column(String(2), primary_key=True)
    last_value: Mapped[int] = mapped_column(default=0, nullable=False)


class Equipment(Base):
    __tablename__ = "equipment"
    __table_args__ = (
        Index("uq_equipment_asset_number", "asset_number", unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_number: Mapped[str] = mapped_column(String(32), nullable=False)

    rfid_uid: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))

    # Books only; hardware leaves it empty
    genre_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("genres.id"), nullable=True, index=True
    )

    status: Mapped[EquipmentStatus] = mapped_column(
        Enum(EquipmentStatus), default=EquipmentStatus.available
    )
    condition: Mapped[EquipmentCondition] = mapped_column(
        Enum(EquipmentCondition), default=EquipmentCondition.good
    )
    replacement_cost: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    category = relationship("Category", back_populates="equipment")
    genre = relationship("Genre", back_populates="equipment")
    transactions = relationship("Transaction", back_populates="equipment")
