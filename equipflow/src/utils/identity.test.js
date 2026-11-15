import { describe, expect, it } from 'vitest'
import { departmentCode, emailError, idDepartmentError, idError, identityError, isStaffId, isStudentSrCode, normalizeId, normalizeLoginId, studentEmail } from './identity'

describe('student SR-code', () => {
  it('accepts 2*-***** and nothing else', () => {
    for (const ok of ['24-12345', '21-00001', '29-99999']) expect(isStudentSrCode(ok)).toBe(true)
    for (const bad of ['34-12345', '24-1234', '24-123456', '2412345', '24 12345', 'CICS 01', '']) expect(isStudentSrCode(bad)).toBe(false)
  })

  it('builds the e-mail from the SR-code, and not before it is valid', () => {
    expect(studentEmail('24-12345')).toBe('24-12345@g.batstate-u.edu.ph')
    expect(studentEmail('24-123')).toBe('')
  })

  it('only accepts that exact e-mail', () => {
    expect(emailError('student', '24-12345@g.batstate-u.edu.ph', '24-12345')).toBe('')
    expect(emailError('student', '24-12345@gmail.com', '24-12345')).not.toBe('')
    expect(emailError('student', '24-99999@g.batstate-u.edu.ph', '24-12345')).not.toBe('')
  })
})

describe('teacher and staff ID', () => {
  it('accepts department + 2-digit number', () => {
    for (const ok of ['CICS 01', 'CET 45', 'cics 01', 'CICS-01', 'CICS01', ' CAFAD 12 ']) expect(isStaffId(ok)).toBe(true)
    for (const bad of ['C 01', 'CICS 1', 'CICS 123', '01', 'CICS', '24-12345']) expect(isStaffId(bad)).toBe(false)
  })

  it('tidies the ID into "CODE NN"', () => {
    expect(normalizeId('teacher', 'cics-01')).toBe('CICS 01')
    expect(normalizeId('staff', ' cet45 ')).toBe('CET 45')
    expect(normalizeId('student', ' 24-12345 ')).toBe('24-12345')
  })

  it('refuses an SR-code with a clear reason', () => {
    expect(idError('teacher', '24-12345')).toMatch(/do not use SR-codes/)
    expect(idError('staff', '24-12345')).toMatch(/Staff ID/)
    expect(idError('teacher', 'CICS 01')).toBe('')
  })

  it('needs a name@g.batstate-u.edu.ph e-mail that is not an SR-code', () => {
    expect(emailError('teacher', 'juan.delacruz@g.batstate-u.edu.ph')).toBe('')
    expect(emailError('staff', 'JUAN@G.BATSTATE-U.EDU.PH')).toBe('')
    expect(emailError('teacher', 'juan@gmail.com')).not.toBe('')
    expect(emailError('teacher', 'juan@batstate-u.edu.ph')).not.toBe('')
    expect(emailError('teacher', '24-12345@g.batstate-u.edu.ph')).not.toBe('')
  })
})

describe('identityError', () => {
  it('reports the ID problem first, then the e-mail problem', () => {
    expect(identityError('teacher', '24-12345', 'a@gmail.com')).toMatch(/SR-codes/)
    expect(identityError('teacher', 'CICS 01', 'a@gmail.com')).toMatch(/e-mail/)
    expect(identityError('teacher', 'CICS 01', 'a@g.batstate-u.edu.ph')).toBe('')
    expect(identityError('student', '24-12345', '24-12345@g.batstate-u.edu.ph')).toBe('')
  })
})

describe('sign-in box', () => {
  it('tidies a staff ID but leaves an SR-code alone', () => {
    expect(normalizeLoginId('cics01')).toBe('CICS 01')
    expect(normalizeLoginId(' 24-12345 ')).toBe('24-12345')
  })
})

describe('ID must start with the department', () => {
  const CICS = { id: 1, name: 'CICS' }

  it('takes the department code from `code`, or from a short name', () => {
    expect(departmentCode({ code: 'cet', name: 'College of Engineering Technology' })).toBe('CET')
    expect(departmentCode(CICS)).toBe('CICS')
    expect(departmentCode({ name: 'General Service' })).toBe('')
    expect(departmentCode(undefined)).toBe('')
  })

  it('accepts a matching prefix and refuses another department\'s', () => {
    expect(idDepartmentError('teacher', 'CICS 01', CICS)).toBe('')
    expect(idDepartmentError('teacher', 'cics-01', CICS)).toBe('')
    expect(idDepartmentError('staff', 'CET 45', CICS)).toMatch(/must start with your department, CICS/)
  })

  it('does not check students, or a department whose letters are unknown', () => {
    expect(idDepartmentError('student', '24-12345', CICS)).toBe('')
    expect(idDepartmentError('staff', 'GS 01', { name: 'General Service' })).toBe('')
    expect(idDepartmentError('staff', 'CET 45', null)).toBe('')
  })

  it('is part of identityError', () => {
    expect(identityError('teacher', 'CET 45', 'a@g.batstate-u.edu.ph', CICS)).toMatch(/CICS/)
    expect(identityError('teacher', 'CICS 45', 'a@g.batstate-u.edu.ph', CICS)).toBe('')
  })
})
