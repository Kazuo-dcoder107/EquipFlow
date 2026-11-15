import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import { normalizeLoginId, upperCase } from '../utils/identity'

export default function Login() {
  const { user, login } = useAuth()
  const location = useLocation()

  // Each piece of form data lives in "state". When state changes, React redraws the form.
  const [srCode, setSrCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // The sign-in form always starts empty. A page the browser restores from its back/forward cache
  // (for example after signing out and pressing Back) would otherwise bring the old text back.
  useEffect(() => {
    const clear = (event) => {
      if (event.persisted) {
        setSrCode('')
        setPassword('')
        setError('')
        setBusy(false)
      }
    }
    window.addEventListener('pageshow', clear)
    return () => window.removeEventListener('pageshow', clear)
  }, [])

  // Already logged in (or just logged in)? Go to the page they wanted, or home.
  if (user) return <Navigate to={location.state?.from || '/'} replace />

  async function handleSubmit(event) {
    event.preventDefault() // stop the browser from reloading the page
    setError('')
    setBusy(true)
    try {
      await login(normalizeLoginId(srCode), password)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <h1 className="auth-brand">EquipFlow</h1>
      <p className="muted center">Borrow school equipment and books.</p>

      <form className="card form" onSubmit={handleSubmit} autoComplete="off">
        <h2>Sign in</h2>

        <label>
          SR-code or Staff ID
          {/* autoComplete="off" and the data-* flags stop the browser and password managers from
              refilling the form with the last person's details */}
          <input
            value={srCode}
            onChange={(e) => setSrCode(upperCase(e.target.value))}
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

      <p className="center">
        New here? <Link to="/register">Create an account</Link>
      </p>
    </div>
  )
}
