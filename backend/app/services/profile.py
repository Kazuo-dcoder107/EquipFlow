"""The "about you" details: age, department, and (students only) year level and program.

Rules
  * Students must have all four: age, department, year level and program.
  * Teachers and staff may give age and department, but never year level or program.
  * A program must belong to the chosen department, and only departments that have programs
    can be chosen by students (so "General Service" is for teachers and staff).
"""
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Department, Program, User, UserRole

DEPARTMENT_NAMES = ["CICS", "CAFAD", "CET", "COE", "General Service"]
YEAR_LEVELS = (1, 2, 3, 4, 5)   # 1st year ... 5th year
MIN_AGE, MAX_AGE = 15, 99

# PLACEHOLDERS: a starting list so a new installation works straight away. Replace it with your
# school's real programs through the admin API (add, rename, delete); it is only ever created
# once, on the very first start of an empty database.
STARTER_PROGRAMS = {
    "CICS": [
        "Bachelor of Science in Information Technology",
        "Bachelor of Science in Computer Science",
        "Bachelor of Science in Information Systems",
    ],
    "CAFAD": [
        "Bachelor of Science in Architecture",
        "Bachelor of Science in Interior Design",
        "Bachelor of Fine Arts",
    ],
    "CET": [
        "Bachelor of Science in Industrial Technology",
        "Bachelor of Science in Electrical Technology",
    ],
    "COE": [
        "Bachelor of Science in Civil Engineering",
        "Bachelor of Science in Computer Engineering",
        "Bachelor of Science in Electrical Engineering",
        "Bachelor of Science in Mechanical Engineering",
    ],
    "General Service": [],
}


def bootstrap_school_structure(db: Session) -> bool:
    """On the first start of an empty database, create the departments and the starter programs.
    Does nothing once departments exist. Returns True if it created them."""
    if db.scalar(select(func.count()).select_from(Department)):
        return False
    for name in DEPARTMENT_NAMES:
        department = Department(name=name)
        department.programs = [Program(name=p) for p in STARTER_PROGRAMS.get(name, [])]
        db.add(department)
    db.commit()
    return True


def profile_complete(user: User) -> bool:
    """Students need all four details; nobody else has anything required."""
    if user.role != UserRole.student:
        return True
    return None not in (user.age, user.department_id, user.year_level, user.program_id)


def validate_profile(db: Session, role: UserRole, *, age: Optional[int], department_id: Optional[int],
                     year_level: Optional[int], program_id: Optional[int]) -> dict:
    """Check the four details against the rules above; returns them cleaned, or raises a 422
    whose message is safe to show to the person."""
    problems = []
    student = role == UserRole.student

    if age is not None and not MIN_AGE <= age <= MAX_AGE:
        problems.append(f"Age must be between {MIN_AGE} and {MAX_AGE}.")
    department = db.get(Department, department_id) if department_id is not None else None
    if department_id is not None and department is None:
        problems.append("Unknown department.")

    if student:
        if age is None:
            problems.append("Age is required.")
        if department_id is None:
            problems.append("Department is required.")
        if year_level is None:
            problems.append("Year level is required.")
        elif year_level not in YEAR_LEVELS:
            problems.append("Year level must be 1st to 5th year.")
        if program_id is None:
            problems.append("Program is required.")
        else:
            program = db.get(Program, program_id)
            if program is None:
                problems.append("Unknown program.")
            elif department is not None and program.department_id != department.id:
                problems.append("That program does not belong to the selected department.")
    elif year_level is not None or program_id is not None:
        problems.append("Year level and program are for students only.")

    if problems:
        raise HTTPException(status_code=422, detail=" ".join(problems))
    return {"age": age, "department_id": department_id,
            "year_level": year_level if student else None,
            "program_id": program_id if student else None}
