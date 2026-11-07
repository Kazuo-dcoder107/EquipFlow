"""Departments (a fixed list) and their programs (managed by admins).

Anyone may read the list, even before signing in, because the registration form needs it.
Only admins add, rename and delete programs, so every student picks from the same spelling.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models import Department, Program, User, UserRole
from app.schemas.school import (DepartmentOut, DepartmentOverview, ProgramIn, ProgramOut,
                                ProgramOverview, ProgramRename)
from app.security import require_admin
from app.services.taxonomy import name_key

router = APIRouter(tags=["school"])


def _program_or_404(db: Session, program_id: int) -> Program:
    program = db.get(Program, program_id)
    if program is None:
        raise HTTPException(status_code=404, detail="Program not found")
    return program


def _clash(db: Session, department_id: int, name: str, ignore_id: Optional[int] = None) -> Optional[str]:
    """A message if `name` already exists in that department (ignoring case, spaces, punctuation)."""
    key = name_key(name)
    for other in db.scalars(select(Program).where(Program.department_id == department_id)):
        if other.id != ignore_id and name_key(other.name) == key:
            return f'"{other.name}" already exists in this department'
    return None


@router.get("/api/departments", response_model=List[DepartmentOut])
def list_departments(db: Session = Depends(get_db)):
    departments = db.scalars(select(Department).options(selectinload(Department.programs))
                             .order_by(Department.id)).all()
    return [DepartmentOut(id=d.id, name=d.name,
                          programs=[{"id": p.id, "name": p.name} for p in d.programs])
            for d in departments]


@router.get("/api/departments/overview", response_model=List[DepartmentOverview],
            dependencies=[Depends(require_admin)])
def departments_overview(db: Session = Depends(get_db)):
    """For browsing people by department and program: how many belong to each."""
    members = dict(db.execute(select(User.department_id, func.count())
                              .where(User.department_id.is_not(None)).group_by(User.department_id)).all())
    students = dict(db.execute(select(User.department_id, func.count())
                               .where(User.department_id.is_not(None), User.role == UserRole.student)
                               .group_by(User.department_id)).all())
    per_program = dict(db.execute(select(User.program_id, func.count())
                                  .where(User.program_id.is_not(None)).group_by(User.program_id)).all())
    departments = db.scalars(select(Department).options(selectinload(Department.programs))
                             .order_by(Department.id)).all()
    return [DepartmentOverview(
        id=d.id, name=d.name, members=members.get(d.id, 0), students=students.get(d.id, 0),
        programs=[ProgramOverview(id=p.id, name=p.name, students=per_program.get(p.id, 0)) for p in d.programs])
        for d in departments]


@router.post("/api/programs", response_model=ProgramOut, status_code=201,
             dependencies=[Depends(require_admin)])
def create_program(body: ProgramIn, db: Session = Depends(get_db)):
    if db.get(Department, body.department_id) is None:
        raise HTTPException(status_code=404, detail="Department not found")
    clash = _clash(db, body.department_id, body.name)
    if clash:
        raise HTTPException(status_code=409, detail=clash)
    program = Program(department_id=body.department_id, name=body.name)
    db.add(program)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="That program already exists in this department")
    return ProgramOut(id=program.id, name=program.name, department_id=program.department_id)


@router.patch("/api/programs/{program_id}", response_model=ProgramOut, dependencies=[Depends(require_admin)])
def rename_program(program_id: int, body: ProgramRename, db: Session = Depends(get_db)):
    """Rename only: moving a program to another department would break the students who chose it."""
    program = _program_or_404(db, program_id)
    if body.name != program.name:
        clash = _clash(db, program.department_id, body.name, program.id)
        if clash:
            raise HTTPException(status_code=409, detail=clash)
        program.name = body.name
        db.commit()
    return ProgramOut(id=program.id, name=program.name, department_id=program.department_id)


@router.delete("/api/programs/{program_id}", dependencies=[Depends(require_admin)])
def delete_program(program_id: int, reassign_to: Optional[int] = None, db: Session = Depends(get_db)):
    """A program that students still use is not deleted by accident. Pass `reassign_to=<program id>`
    to move those students to another program first (their department follows it), because every
    student must always have a program."""
    program = _program_or_404(db, program_id)
    in_use = db.scalar(select(func.count()).select_from(User).where(User.program_id == program.id))
    if in_use:
        if reassign_to is None:
            raise HTTPException(status_code=409,
                                detail=f"{in_use} student(s) use this program; pass reassign_to=<program id>")
        target = db.get(Program, reassign_to)
        if target is None or target.id == program.id:
            raise HTTPException(status_code=404, detail="Target program not found")
        db.execute(update(User).where(User.program_id == program.id)
                   .values(program_id=target.id, department_id=target.department_id))
    db.delete(program)
    db.commit()
    return {"ok": True, "students_moved": in_use}
