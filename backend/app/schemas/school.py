from typing import List

from pydantic import BaseModel, field_validator


def _name(value: str) -> str:
    value = " ".join(value.split())
    if not value or len(value) > 120:
        raise ValueError("Name must be 1-120 characters")
    return value


class ProgramIn(BaseModel):
    department_id: int
    name: str

    _name = field_validator("name")(lambda cls, v: _name(v))


class ProgramRename(BaseModel):
    name: str

    _name = field_validator("name")(lambda cls, v: _name(v))


class ProgramOut(BaseModel):
    id: int
    name: str
    department_id: int


class ProgramInDepartment(BaseModel):
    id: int
    name: str


class DepartmentOut(BaseModel):
    id: int
    name: str
    programs: List[ProgramInDepartment]


class ProgramOverview(BaseModel):
    id: int
    name: str
    students: int


class DepartmentOverview(BaseModel):
    id: int
    name: str
    members: int      # everyone who chose this department
    students: int
    programs: List[ProgramOverview]
