import { useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { useApi } from '../hooks/useApi'
import { profileValues, toProfilePayload } from '../utils/profile'
import AboutFields from './AboutFields'
import ErrorBox from './ErrorBox'
import Loading from './Loading'

// The "About you" card on the Profile page: age and department for everyone, plus year level and
// program for students (who must fill in all four). Saving sends the whole set to the API.
export default function AboutYouCard() {
  const { user, refreshUser } = useAuth()
  const departments = useApi(() => api.departments(), [])

  const [values, setValues] = useState(() => profileValues(user)) // starts from what is saved
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const student = user.role === 'student'

  function change(patch) {
    setValues({ ...values, ...patch })
    setSaved(false) // the "Saved" message belongs to the previous version of the form
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSaved(false)
    setSaving(true)
    try {
      await api.updateProfile(toProfilePayload(values, user.role))
      await refreshUser() // so the rest of the site sees the new details
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit}>
      <h2>About you</h2>

      {departments.loading && <Loading text="Loading departments..." count={1} />}
      {departments.error && <ErrorBox message={departments.error} onRetry={departments.reload} />}

      {departments.data && (
        <>
          <AboutFields role={user.role} values={values} onChange={change} departments={departments.data} />
          {student && <p className="hint">Fields marked * are required.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {saved && <p className="saved" role="status">Saved</p>}
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </>
      )}
    </form>
  )
}
