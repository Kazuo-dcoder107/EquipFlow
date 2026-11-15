import { useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { useApi } from '../hooks/useApi'
import { profileValues, toProfilePayload } from '../utils/profile'
import AboutFields from './AboutFields'
import IdentityFields from './IdentityFields'
import { departmentCode, emailError, idDepartmentError, idError, normalizeId } from '../utils/identity'
import ErrorBox from './ErrorBox'
import Loading from './Loading'

// The "About you" card on the Profile page: age and department for everyone, plus year level and
// program for students (who must fill in all four). Saving sends the whole set to the API.
export default function AboutYouCard() {
  const { user, refreshUser } = useAuth()
  const departments = useApi(() => api.departments(), [])

  const [values, setValues] = useState(() => profileValues(user)) // starts from what is saved
  // the ID number (SR-code for students, department number for teachers and staff) and the e-mail
  const [identity, setIdentity] = useState(() => ({ sr_code: user.sr_code, email: user.email }))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const student = user.role === 'student'

  function change(patch) {
    setValues({ ...values, ...patch })
    setSaved(false) // the "Saved" message belongs to the previous version of the form
  }

  function changeIdentity(patch) {
    setIdentity({ ...identity, ...patch })
    setSaved(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSaved(false)

    // Only an ID or e-mail the person actually changed is checked and sent, so an older account
    // can still save its other details without being forced to change them.
    const idNumber = normalizeId(user.role, identity.sr_code)
    const email = identity.email.trim().toLowerCase()
    const idChanged = idNumber !== user.sr_code
    const emailChanged = email !== user.email.toLowerCase()
    // teachers and staff: the ID must start with their department's code (checked when either one changed)
    const department = departments.data?.find((d) => String(d.id) === String(values.department_id))
    const departmentChanged = String(values.department_id) !== String(user.department_id ?? '')
    const problem =
      (idChanged && idError(user.role, idNumber)) ||
      ((idChanged || departmentChanged) && idDepartmentError(user.role, idNumber, department)) ||
      (emailChanged && emailError(user.role, email, idNumber))
    if (problem) {
      setError(problem)
      return
    }

    setSaving(true)
    try {
      await api.updateProfile({
        ...toProfilePayload(values, user.role),
        ...(idChanged && { sr_code: idNumber }),
        ...(emailChanged && { email }),
      })
      setIdentity({ sr_code: idNumber, email })
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
          <IdentityFields
            role={user.role}
            idNumber={identity.sr_code}
            email={identity.email}
            onChange={changeIdentity}
            departmentCode={departmentCode(departments.data.find((d) => String(d.id) === String(values.department_id)))}
          />
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
