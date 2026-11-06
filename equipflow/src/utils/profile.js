// Helpers for the "about you" details: age, department, and (students only) year level and program.
// The same rules are enforced by the API; the site follows them so people are guided to valid answers.

export const MIN_AGE = 15
export const MAX_AGE = 99

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th']
export const YEAR_LEVEL_OPTIONS = ORDINALS.map((ordinal, index) => ({ value: index + 1, label: `${ordinal} year` }))

/** Students can only pick a department that has programs (so "General Service" is for staff). */
export const studentDepartments = (departments) => departments.filter((d) => d.programs.length > 0)

/** The programs of one department; `departmentId` may be a number or the string from a <select>. */
export const programsOf = (departments, departmentId) =>
  departments.find((d) => String(d.id) === String(departmentId))?.programs ?? []

/** The form keeps everything as text; empty values are sent as null. */
const toNumber = (text) => (text === '' || text == null ? null : Number(text))

/** What to send to the API. Only students send year level and program. */
export function toProfilePayload(values, role) {
  const student = role === 'student'
  return {
    age: toNumber(values.age),
    department_id: toNumber(values.department_id),
    year_level: student ? toNumber(values.year_level) : null,
    program_id: student ? toNumber(values.program_id) : null,
  }
}

/** The form's starting values, from a user. */
export const profileValues = (user) => ({
  age: user.age == null ? '' : String(user.age),
  department_id: user.department_id == null ? '' : String(user.department_id),
  year_level: user.year_level == null ? '' : String(user.year_level),
  program_id: user.program_id == null ? '' : String(user.program_id),
})

export const emptyProfileValues = () => ({ age: '', department_id: '', year_level: '', program_id: '' })
