import { EMAIL_DOMAIN, idExample, idLabel, isStudent, studentEmail, upperCase } from '../utils/identity'

/**
 * The ID number and e-mail boxes, shared by the sign-up form and the Profile page.
 *
 *   students          SR-code (24-12345). The e-mail is filled in for them as srcode@g.batstate-u.edu.ph.
 *   teachers / staff  ID number (department + number: CICS 01). They type their own name@g.batstate-u.edu.ph.
 *
 *   role, idNumber, email - the current values
 *   departmentCode        - teachers and staff: the letters their ID must start with (shown as the example)
 *   onChange              - called with the part that changed: onChange({ sr_code, email })
 */
export default function IdentityFields({ role, idNumber, email, onChange, departmentCode = '' }) {
  const student = isStudent(role)

  const example = student ? idExample(role) : `${departmentCode || 'CICS'} 01`

  function changeId(text) {
    // a student's e-mail follows the SR-code, so the two are updated together;
    // a teacher's or staff member's ID is always shown in capitals
    onChange(student ? { sr_code: text, email: studentEmail(text) } : { sr_code: upperCase(text) })
  }

  return (
    <>
      <label>
        {idLabel(role)}
        <input
          value={idNumber}
          onChange={(e) => changeId(e.target.value)}
          placeholder={example}
          autoComplete="off"
          autoCapitalize={student ? 'off' : 'characters'}
          required
        />
        <span className="hint">
          {student ? 'Format: 24-12345.' : `Your department and number, like ${example}. It must start with your own department. SR-codes are not accepted.`}
        </span>
      </label>

      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => onChange({ email: e.target.value })}
          placeholder={student ? `24-12345@${EMAIL_DOMAIN}` : `name@${EMAIL_DOMAIN}`}
          autoComplete="off"
          readOnly={student}
          required
        />
        <span className="hint">
          {student ? 'Filled in from your SR-code.' : `Your name followed by @${EMAIL_DOMAIN}.`}
        </span>
      </label>
    </>
  )
}
