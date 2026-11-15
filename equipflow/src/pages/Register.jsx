import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useApi } from '../hooks/useApi'
import { emptyProfileValues, studentDepartments, toProfilePayload } from '../utils/profile'
import AboutFields from '../components/AboutFields'
import IdentityFields from '../components/IdentityFields'
import { departmentCode, identityError, normalizeId } from '../utils/identity'
import ErrorBox from '../components/ErrorBox'
import Loading from '../components/Loading'

const ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'staff', label: 'Staff' },
]

export default function Register() {
  const [form, setForm] = useState({
    sr_code: '', full_name: '', email: '', password: '', confirm: '', role: 'student',
  })
  const [about, setAbout] = useState(emptyProfileValues()) // age, department, year level, program
  const departments = useApi(() => api.departments(), [])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(null) // the account the API created, once it exists

  // One small function updates any field: update('password')(event)
  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value })

  // A student's ID is an SR-code and a teacher's or staff member's is a department number, so the
  // two formats must never carry over when the role changes: start the ID and e-mail again.
  // The department answers belong to the role too (a student's list has programs, a teacher's does not).
  const changeRole = (event) => {
    setForm({ ...form, role: event.target.value, sr_code: '', email: '' })
    setAbout(emptyProfileValues())
  }

  const isStudent = form.role === 'student'
  // teachers and staff choose their department at the top; their ID must start with its code
  const department = departments.data?.find((d) => String(d.id) === String(about.department_id))
  // Students cannot register until the school's departments and programs have loaded
  const noPrograms = isStudent && departments.data && studentDepartments(departments.data).length === 0

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const idNumber = normalizeId(form.role, form.sr_code)
    const problem = identityError(form.role, idNumber, form.email, isStudent ? null : department)
    if (problem) {
      setError(problem)
      return
    }
    if (form.password !== form.confirm) {
      setError('The two passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const { confirm, ...fields } = form // everything except the confirm box
      // students send age, department, year level and program; teachers and staff send their department
      const extra = isStudent ? toProfilePayload(about, 'student') : { department_id: Number(about.department_id) }
      setCreated(await api.register({ ...fields, ...extra, sr_code: idNumber, email: form.email.trim().toLowerCase(), full_name: form.full_name.trim() }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // After signing up, show what happens next instead of the form.
  if (created) {
    const needsApproval = created.status === 'pending_approval'
    return (
      <div className="auth-page">
        <h1 className="auth-brand">EquipFlow</h1>
        <div className="card">
          <h2>{needsApproval ? 'Request sent' : 'Account created'}</h2>
          {needsApproval ? (
            <p>
              An admin will review your {created.role} registration. Once it is approved, tap your ID card
              at the kiosk to finish.
            </p>
          ) : (
            <p>Next, link your ID card at the kiosk. After that you can start borrowing.</p>
          )}
          <Link className="btn btn-primary" to="/login">Go to sign in</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <h1 className="auth-brand">EquipFlow</h1>

      <form className="card form" onSubmit={handleSubmit}>
        <h2>Create an account</h2>

        <label>
          I am a
          <select value={form.role} onChange={changeRole}>
            {ROLES.map((role) => (
              <option key={role.value} value={role.value}>{role.label}</option>
            ))}
          </select>
        </label>
        {form.role !== 'student' && (
          <p className="notice notice-info small">Teacher and staff accounts need an admin's approval before you can borrow.</p>
        )}

        {!isStudent && (
          <label>
            Department
            <select
              value={about.department_id}
              onChange={(e) => setAbout({ ...about, department_id: e.target.value })}
              disabled={!departments.data}
              required
            >
              <option value="">{departments.data ? 'Choose department' : 'Loading departments...'}</option>
              {(departments.data || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        )}

        <IdentityFields
          role={form.role}
          departmentCode={departmentCode(department)}
          idNumber={form.sr_code}
          email={form.email}
          onChange={(patch) => setForm({ ...form, ...patch })}
        />
        <label>
          Full name
          <input value={form.full_name} onChange={update('full_name')} autoComplete="name" required />
        </label>
        <label>
          Password
          <input type="password" value={form.password} onChange={update('password')} autoComplete="new-password" minLength={8} required />
          <span className="hint">At least 8 characters.</span>
        </label>
        <label>
          Confirm password
          <input type="password" value={form.confirm} onChange={update('confirm')} autoComplete="new-password" required />
        </label>

        {isStudent && (
          <>
            <h3 className="form-section">About you</h3>
            {departments.loading && <Loading text="Loading departments..." count={1} />}
            {departments.error && <ErrorBox message={departments.error} onRetry={departments.reload} />}
            {noPrograms && (
              <p className="notice notice-warning small">
                Student sign-up is not open yet: an admin still has to add the programs.
              </p>
            )}
            {departments.data && !noPrograms && (
              <AboutFields
                role="student"
                values={about}
                onChange={(patch) => setAbout({ ...about, ...patch })}
                departments={departments.data}
              />
            )}
          </>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}

        <button className="btn btn-primary" disabled={busy || !departments.data || noPrograms}>
          {busy ? 'Creating...' : 'Create account'}
        </button>
      </form>

      <p className="center">
        Already registered? <Link to="/login">Sign in</Link>
      </p>
    </div>
  )
}
