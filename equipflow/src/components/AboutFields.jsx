import { MAX_AGE, MIN_AGE, YEAR_LEVEL_OPTIONS, programsOf, studentDepartments } from '../utils/profile'

// A label with a red star when the field is required.
function Field({ label, required, children }) {
  return (
    <label>
      <span>
        {label}
        {required && <span className="req" aria-hidden="true"> *</span>}
      </span>
      {children}
    </label>
  )
}

/**
 * The "about you" fields, shared by the sign-up form and the Profile page.
 *
 *   role        - "student" also gets year level and program, and every field is required;
 *                 teachers and staff only get age and department, both optional
 *   values      - the current answers, all kept as text (see utils/profile.js)
 *   onChange    - called with the part that changed: onChange({ age: '21' })
 *   departments - the list from the API, each with its programs
 */
export default function AboutFields({ role, values, onChange, departments }) {
  const student = role === 'student'
  const departmentChoices = student ? studentDepartments(departments) : departments
  const programs = programsOf(departments, values.department_id)
  const chosenProgram = programs.find((p) => String(p.id) === String(values.program_id))

  return (
    <>
      <Field label="Age" required={student}>
        <input
          type="number"
          inputMode="numeric"
          min={MIN_AGE}
          max={MAX_AGE}
          value={values.age}
          onChange={(e) => onChange({ age: e.target.value })}
          required={student}
        />
      </Field>

      <Field label="Department" required={student}>
        <select
          value={values.department_id}
          // a program belongs to one department, so changing the department clears the program
          onChange={(e) => onChange({ department_id: e.target.value, program_id: '' })}
          required={student}
        >
          <option value="">Choose department</option>
          {departmentChoices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Field>

      {student && (
        <>
          <Field label="Year level" required>
            <select value={values.year_level} onChange={(e) => onChange({ year_level: e.target.value })} required>
              <option value="">Choose year level</option>
              {YEAR_LEVEL_OPTIONS.map((y) => <option key={y.value} value={y.value}>{y.label}</option>)}
            </select>
          </Field>

          <Field label="Program" required>
            <select
              value={values.program_id}
              onChange={(e) => onChange({ program_id: e.target.value })}
              disabled={!values.department_id}
              required
            >
              <option value="">{values.department_id ? 'Choose program' : 'Choose a department first'}</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {/* A closed dropdown cuts long names on a phone ("Bachelor of Science in Informatio..."),
                and several programs start the same way, so the full name is shown underneath. */}
            {chosenProgram && <span className="selected-full" aria-hidden="true">{chosenProgram.name}</span>}
          </Field>
        </>
      )}
    </>
  )
}
