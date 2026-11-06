import { describe, expect, it } from 'vitest'
import { YEAR_LEVEL_OPTIONS, emptyProfileValues, profileValues, programsOf, studentDepartments, toProfilePayload } from './profile'
import { DEPARTMENTS } from '../test/helpers'

describe('year levels', () => {
  it('run from 1st to 5th year', () => {
    expect(YEAR_LEVEL_OPTIONS.map((y) => y.label)).toEqual(['1st year', '2nd year', '3rd year', '4th year', '5th year'])
    expect(YEAR_LEVEL_OPTIONS.map((y) => y.value)).toEqual([1, 2, 3, 4, 5])
  })
})

describe('departments and programs', () => {
  it('lets students pick only departments that have programs', () => {
    expect(studentDepartments(DEPARTMENTS).map((d) => d.name)).toEqual(['CICS', 'CAFAD', 'COE'])
  })

  it('finds the programs of a department, from a number or from a <select> string', () => {
    expect(programsOf(DEPARTMENTS, 1).map((p) => p.id)).toEqual([1, 2])
    expect(programsOf(DEPARTMENTS, '4').map((p) => p.name)).toEqual(['Bachelor of Science in Civil Engineering'])
    expect(programsOf(DEPARTMENTS, '')).toEqual([])
    expect(programsOf(DEPARTMENTS, 999)).toEqual([])
  })
})

describe('toProfilePayload', () => {
  const form = { age: '21', department_id: '1', year_level: '3', program_id: '2' }

  it('sends numbers, and all four details for a student', () => {
    expect(toProfilePayload(form, 'student')).toEqual({ age: 21, department_id: 1, year_level: 3, program_id: 2 })
  })

  it('never sends year level or program for teachers and staff, even if the form held them', () => {
    for (const role of ['teacher', 'staff']) {
      expect(toProfilePayload(form, role)).toEqual({ age: 21, department_id: 1, year_level: null, program_id: null })
    }
  })

  it('turns empty answers into null', () => {
    expect(toProfilePayload(emptyProfileValues(), 'teacher')).toEqual({ age: null, department_id: null, year_level: null, program_id: null })
  })
})

describe('profileValues', () => {
  it('starts the form from what is saved, as text', () => {
    expect(profileValues({ age: 20, department_id: 1, year_level: 3, program_id: 1 })).toEqual({ age: '20', department_id: '1', year_level: '3', program_id: '1' })
  })
  it('uses empty text for details that are not set yet', () => {
    expect(profileValues({ age: null, department_id: null, year_level: null, program_id: null })).toEqual(emptyProfileValues())
  })
})
