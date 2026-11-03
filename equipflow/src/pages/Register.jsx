import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

const ROLES = [
  { value: 'student', label: 'Student' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'staff', label: 'Staff' },
]

export default function Register() {
  const [form, setForm] = useState({
    sr_code: '', full_name: '', email: '', password: '', confirm: '', role: 'student',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(null) // the account the API created, once it exists

  // One small function updates any field: update('email')(event)
  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value })

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (form.password !== form.confirm) {
      setError('The two passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const { confirm, ...fields } = form // everything except the confirm box
      setCreated(await api.register({ ...fields, sr_code: form.sr_code.trim(), full_name: form.full_name.trim() }))
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
          <select value={form.role} onChange={update('role')}>
            {ROLES.map((role) => (
              <option key={role.value} value={role.value}>{role.label}</option>
            ))}
          </select>
        </label>
        {form.role !== 'student' && (
          <p className="notice notice-info small">Teacher and staff accounts need an admin's approval before you can borrow.</p>
        )}

        <label>
          SR-code
          <input value={form.sr_code} onChange={update('sr_code')} required />
        </label>
        <label>
          Full name
          <input value={form.full_name} onChange={update('full_name')} autoComplete="name" required />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={update('email')} autoComplete="email" required />
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

        {error && <p className="form-error" role="alert">{error}</p>}

        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating...' : 'Create account'}
        </button>
      </form>

      <p className="center">
        Already registered? <Link to="/login">Sign in</Link>
      </p>
    </div>
  )
}
