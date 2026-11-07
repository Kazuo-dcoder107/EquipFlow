from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Department(Base):
    """CICS, CAFAD, CET, COE, General Service. A fixed list created by the app itself."""
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(60), unique=True)

    programs = relationship("Program", back_populates="department", order_by="Program.name")


class Program(Base):
    """A degree program (e.g. Bachelor of Science in Information Technology) inside one
    department. Admins add, rename and delete these, so every student picks from the same
    spelling instead of typing their own."""
    __tablename__ = "programs"
    __table_args__ = (UniqueConstraint("department_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))

    department = relationship("Department", back_populates="programs")
