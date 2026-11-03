import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'

export default function Login() {
  const { user, login } = useAuth()
  const location = useLocation()

  // Each piece of form data lives in "state". When state changes, React redraws the form.
  const [srCode, setSrCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Already logged in (or just logged in)? Go to the page they wanted, or home.
  if (user) return <Navigate to={location.state?.from || '/'} replace />

  async function handleSubmit(event) {
    event.preventDefault() // stop the browser from reloading the page
    setError('')
    setBusy(true)
    try {
      await login(srCode.trim(), password)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <h1 className="auth-brand">EquipFlow</h1>
      <p className="muted center">Borrow school equipment and books.</p>

      <form className="card form" onSubmit={handleSubmit}>
        <h2>Sign in</h2>

        <label>
          SR-code
          <input value={srCode} onChange={(e) => setSrCode(e.target.value)} autoComplete="username" required />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className="form-error" role="alert">{error}</p>}

        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p className="center">
        New here? <Link to="/register">Create an account</Link>
      </p>
    </div>
  )
}
