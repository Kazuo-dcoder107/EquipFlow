import { useState } from 'react'
import { api } from '../api'
import { useApi } from '../hooks/useApi'
import ConfirmDialog from '../components/ConfirmDialog'
import ErrorBox from '../components/ErrorBox'
import FormDialog from '../components/FormDialog'
import Loading from '../components/Loading'

// The list of degree programs students pick from when they sign up. The departments are fixed;
// admins add, rename and delete the programs inside them.
export default function Programs() {
  const { data, loading, error, reload } = useApi(() => api.departmentsOverview(), [])
  const [form, setForm] = useState(null) // { department } to add, or { department, program } to rename
  const [name, setName] = useState('')
  const [deleting, setDeleting] = useState(null) // { department, program }
  const [moveTo, setMoveTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [message, setMessage] = useState('')

  function openForm(department, program) {
    setProblem('')
    setName(program ? program.name : '')
    setForm({ department, program })
  }

  async function save() {
    setBusy(true)
    setProblem('')
    try {
      const clean = name.trim()
      if (form.program) await api.renameProgram(form.program.id, clean)
      else await api.createProgram(form.department.id, clean)
      setMessage(form.program ? `Renamed to ${clean}.` : `Added ${clean} to ${form.department.name}.`)
      setForm(null)
      reload()
    } catch (err) {
      setProblem(err.message)
    } finally {
      setBusy(false)
    }
  }

  function openDelete(department, program) {
    setProblem('')
    setMoveTo('')
    setDeleting({ department, program })
  }

  async function remove() {
    const { program } = deleting
    if (program.students > 0 && !moveTo) return setProblem('Choose the program these students move to.')
    setBusy(true)
    setProblem('')
    try {
      await api.deleteProgram(program.id, program.students > 0 ? { reassign_to: moveTo } : undefined)
      setMessage(`Deleted ${program.name}.`)
      setDeleting(null)
      reload()
    } catch (err) {
      setProblem(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Every program except the one being deleted, for "move students to".
  const otherPrograms = deleting
    ? data.flatMap((d) => d.programs.filter((p) => p.id !== deleting.program.id).map((p) => ({ ...p, department: d.name })))
    : []

  return (
    <>
      <h1>Programs</h1>
      <p className="muted">Students choose their program from these lists when they sign up.</p>

      {message && <p className="notice notice-ok" role="status">{message}</p>}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && data.map((department) => (
        <section key={department.id} className="card" aria-label={department.name}>
          <div className="card-row">
            <h3>{department.name}</h3>
            <button
              type="button"
              className="btn btn-small"
              aria-label={`Add program to ${department.name}`}
              onClick={() => openForm(department)}
            >
              Add program
            </button>
          </div>
          {department.programs.length === 0 ? <p className="muted small">No programs yet.</p> : (
            <ul className="program-list">
              {department.programs.map((program) => (
                <li key={program.id}>
                  <span>{program.name}<span className="muted small block">{program.students} {program.students === 1 ? 'student' : 'students'}</span></span>
                  <span className="row-actions" style={{ flexDirection: 'row' }}>
                    <button
                      type="button"
                      className="btn btn-small"
                      aria-label={`Rename ${program.name}`}
                      onClick={() => openForm(department, program)}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-danger"
                      aria-label={`Delete ${program.name}`}
                      onClick={() => openDelete(department, program)}
                    >
                      Delete
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {form && (
        <FormDialog title={form.program ? `Rename ${form.program.name}` : `Add a program to ${form.department.name}`}
          submitLabel={form.program ? 'Save' : 'Add program'} busy={busy} error={problem} onSubmit={save} onCancel={() => setForm(null)}>
          <label>Program name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required data-autofocus
            placeholder="e.g. Bachelor of Science in Information Technology" /></label>
        </FormDialog>
      )}

      {deleting && (
        <ConfirmDialog title={`Delete ${deleting.program.name}?`} confirmLabel="Delete program" danger busy={busy} error={problem}
          onConfirm={remove} onCancel={() => setDeleting(null)}>
          {deleting.program.students === 0 ? <p>No students use this program.</p> : (
            <>
              <p>{deleting.program.students} student(s) use this program. Every student needs a program, so choose where they move.</p>
              <label className="stack">
                Move students to
                <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                  <option value="">Choose a program...</option>
                  {otherPrograms.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.department})</option>)}
                </select>
              </label>
            </>
          )}
        </ConfirmDialog>
      )}
    </>
  )
}
