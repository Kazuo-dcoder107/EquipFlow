"""Shared by tests that register students: the departments and starter programs, and a valid
set of student details. With a fresh database the first program (id 1) belongs to department 1."""
from app.services.profile import bootstrap_school_structure

# CICS (department 1), 1st year, Bachelor of Science in Information Technology (program 1)
STUDENT_PROFILE = {"age": 20, "department_id": 1, "year_level": 1, "program_id": 1}


def seed_school(session_factory):
    with session_factory() as db:
        bootstrap_school_structure(db)
