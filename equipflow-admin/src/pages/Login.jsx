import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'

export default function Login() {
  const { user, login } = useAuth()
  const location = useLocation()

  // Each piece of form data lives in "state". When state changes, React redraws the form.
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // The sign-in form always starts empty. A page the browser restores from its back/forward cache
  // (for example after signing out and pressing Back) would otherwise bring the old text back.
  useEffect(() => {
    const clear = (event) => {
      if (event.persisted) {
        setUsername('')
        setPassword('')
        setError('')
        setBusy(false)
      }
    }
    window.addEventListener('pageshow', clear)
    return () => window.removeEventListener('pageshow', clear)
  }, [])

  // Already signed in (or just signed in)? Go to the page they wanted, or the dashboard.
  if (user) return <Navigate to={location.state?.from || '/'} replace />

  async function handleSubmit(event) {
    event.preventDefault() // stop the browser from reloading the page
    setError('')
    setBusy(true)
    try {
      await login(username.trim(), password)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <h1 className="auth-brand">EquipFlow Admin</h1>
      <p className="muted center">For administrators only.</p>

      <form className="card form" onSubmit={handleSubmit} autoComplete="off">
        <h2>Sign in</h2>

        <label>
          Username
          {/* autoComplete="off" and the data-* flags stop the browser and password managers from
              refilling the form with the last person's details */}
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            data-lpignore="true"
            data-1p-ignore="true"
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            data-lpignore="true"
            data-1p-ignore="true"
            required
          />
        </label>

        {error && <p className="form-error" role="alert">{error}</p>}

        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p className="muted small center">Students, teachers and staff sign in on the EquipFlow site instead.</p>
    </div>
  )
}
