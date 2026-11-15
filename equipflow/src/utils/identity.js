// The school's rules for ID numbers and e-mail addresses.
//
//   Students          SR-code  24-12345                  e-mail  24-12345@g.batstate-u.edu.ph
//   Teachers / staff  ID       CICS 01, CET 45 ...       e-mail  name@g.batstate-u.edu.ph
//                     (department code + a 2-digit number; an SR-code is NOT accepted)
//
// The API field that holds the ID is still called `sr_code` for every role.

export const EMAIL_DOMAIN = 'g.batstate-u.edu.ph'

/** 2, one more digit, a dash, then five digits: 24-12345 */
export const STUDENT_SR_PATTERN = /^2\d-\d{5}$/

/** Department code (2-6 letters), a space, a 2-digit number: CICS 01, CET 45 */
export const STAFF_ID_PATTERN = /^[A-Z]{2,6} \d{2}$/

// the part of an e-mail address before the @ for teachers and staff: name, name.surname, name_surname ...
const STAFF_EMAIL_PATTERN = new RegExp(`^[a-z0-9]+([._-][a-z0-9]+)*@${EMAIL_DOMAIN.replace(/\./g, '\\.')}$`)

export const isStudent = (role) => role === 'student'

/**
 * The letters a department's staff IDs start with: its `code` if the API sends one, otherwise its
 * name when that is a short code such as CICS or CET. Returns '' for a department without one
 * (for example "General Service"), where the letters cannot be checked.
 */
export function departmentCode(department) {
  const raw = String(department?.code ?? department?.name ?? '').trim()
  return /^[A-Za-z]{2,6}$/.test(raw) ? raw.toUpperCase() : ''
}

/** The department letters at the start of a teacher or staff ID: "CICS 01" gives "CICS". */
export const idPrefix = (id = '') => normalizeStaffId(id).split(' ')[0]

/**
 * Teachers and staff: the ID must start with the code of their own department.
 * Students have no such rule. Returns the reason, or '' when it matches (or cannot be checked).
 */
export function idDepartmentError(role, id, department) {
  if (isStudent(role)) return ''
  const code = departmentCode(department)
  if (!code || idPrefix(id) === code) return ''
  return `Your ${idLabel(role)} must start with your department, ${code} (like ${code} 01), but it starts with ${idPrefix(id)}.`
}

/** Capitals for teacher and staff IDs, as the person types. SR-codes have no letters, so they are unchanged. */
export const upperCase = (text = '') => text.toUpperCase()

/** "Student" accounts use SR-codes; teachers and staff use their ID number. */
export function idLabel(role) {
  if (role === 'teacher') return 'Teacher ID'
  if (role === 'staff') return 'Staff ID'
  return 'SR-code'
}

export const idExample = (role) => (isStudent(role) ? '24-12345' : 'CICS 01')

/** Tidy what was typed. Students: just trim. Teachers/staff: "cics-01" or "CICS01" becomes "CICS 01". */
export function normalizeId(role, text = '') {
  const trimmed = text.trim()
  if (isStudent(role)) return trimmed
  return normalizeStaffId(trimmed)
}

export function normalizeStaffId(text = '') {
  const match = text.trim().match(/^([A-Za-z]+)[\s-]*(\d+)$/)
  return match ? `${match[1].toUpperCase()} ${match[2]}` : text.trim().toUpperCase()
}

/** The sign-in box takes either kind of ID, so a staff ID is tidied only when it looks like one. */
export function normalizeLoginId(text = '') {
  const trimmed = text.trim()
  return /^[A-Za-z]{2,6}[\s-]*\d{2}$/.test(trimmed) ? normalizeStaffId(trimmed) : trimmed
}

export const isStudentSrCode = (text) => STUDENT_SR_PATTERN.test(text.trim())
export const isStaffId = (text) => STAFF_ID_PATTERN.test(normalizeStaffId(text))

/** A student's e-mail follows from the SR-code. Returns '' while the SR-code is not valid yet. */
export const studentEmail = (srCode = '') => (isStudentSrCode(srCode) ? `${srCode.trim()}@${EMAIL_DOMAIN}` : '')

/** Why this ID is not acceptable for this role, or '' when it is fine. */
export function idError(role, text = '') {
  if (isStudent(role)) {
    return isStudentSrCode(text)
      ? ''
      : 'The SR-code must look like 24-12345 (two digits starting with 2, a dash, then five digits).'
  }
  if (isStudentSrCode(text)) {
    return `Teachers and staff do not use SR-codes. Enter your ${idLabel(role)}, your department and number, like CICS 01.`
  }
  return isStaffId(text)
    ? ''
    : `The ${idLabel(role)} must be your department and number, like CICS 01 or CET 45.`
}

/** Why this e-mail is not acceptable for this role and ID, or '' when it is fine. */
export function emailError(role, email = '', id = '') {
  const address = email.trim().toLowerCase()
  if (isStudent(role)) {
    const expected = studentEmail(id)
    return expected && address === expected ? '' : `A student's e-mail must be the SR-code followed by @${EMAIL_DOMAIN}, like 24-12345@${EMAIL_DOMAIN}.`
  }
  if (!STAFF_EMAIL_PATTERN.test(address) || STUDENT_SR_PATTERN.test(address.split('@')[0])) {
    return `The e-mail must be your name followed by @${EMAIL_DOMAIN}, like juan.delacruz@${EMAIL_DOMAIN}.`
  }
  return ''
}

/** Check an ID, its department and the e-mail together. Returns the first problem found, or ''. */
export const identityError = (role, id, email, department) =>
  idError(role, id) || idDepartmentError(role, id, department) || emailError(role, email, normalizeId(role, id))
