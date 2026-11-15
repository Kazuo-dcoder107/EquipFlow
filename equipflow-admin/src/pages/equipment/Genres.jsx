import { useState } from 'react'
import { api } from '../../api'
import { useApi } from '../../hooks/useApi'
import ConfirmDialog from '../../components/ConfirmDialog'
import EmptyState from '../../components/EmptyState'
import ErrorBox from '../../components/ErrorBox'
import FormDialog from '../../components/FormDialog'
import Loading from '../../components/Loading'

// Book genres: one list, so spelling never varies.
export default function Genres() {
  const { data, loading, error, reload } = useApi(() => api.genres(), [])
  const [editing, setEditing] = useState(null) // null | 'new' | a genre (rename)
  const [name, setName] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [moveTo, setMoveTo] = useState('') // '' = leave the books without a genre
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [message, setMessage] = useState('')

  function openForm(genre) {
    setProblem('')
    setName(genre === 'new' ? '' : genre.name)
    setEditing(genre)
  }

  async function save() {
    setBusy(true)
    setProblem('')
    try {
      const clean = name.trim()
      if (editing === 'new') await api.createGenre(clean)
      else await api.renameGenre(editing.id, clean)
      setMessage(editing === 'new' ? `Added ${clean}.` : `Renamed to ${clean}.`)
      setEditing(null)
      reload()
    } catch (err) {
      setProblem(err.message)
    } finally {
      setBusy(false)
    }
  }

  function openDelete(genre) {
    setProblem('')
    setMoveTo('')
    setDeleting(genre)
  }

  async function remove() {
    setBusy(true)
    setProblem('')
    try {
      // Books that use the genre either move to another genre or are left without one.
      const params = deleting.book_count === 0 ? undefined : moveTo ? { reassign_to: moveTo } : { detach: 'true' }
      await api.deleteGenre(deleting.id, params)
      setMessage(`Deleted ${deleting.name}.`)
      setDeleting(null)
      reload()
    } catch (err) {
      setProblem(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="toolbar">
        <p className="muted small">Genres are for books only.</p>
        <button type="button" className="btn btn-primary btn-small" onClick={() => openForm('new')}>Add genre</button>
      </div>

      {message && <p className="notice notice-ok" role="status">{message}</p>}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && data.length === 0 && <EmptyState title="No genres yet">Add genres such as Fiction or Science.</EmptyState>}

      {data && data.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Genres</caption>
            <thead><tr><th>Genre</th><th>Books</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {data.map((g) => (
                <tr key={g.id}>
                  <td data-label="Genre" className="person-cell"><strong>{g.name}</strong></td>
                  <td data-label="Books">{g.book_count}</td>
                  <td data-label="Actions" className="actions">
                    <div className="row-actions">
                      <button type="button" className="btn btn-small" onClick={() => openForm(g)}>Rename</button>
                      <button type="button" className="btn btn-small btn-danger" onClick={() => openDelete(g)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <FormDialog title={editing === 'new' ? 'Add a genre' : `Rename ${editing.name}`} submitLabel={editing === 'new' ? 'Add genre' : 'Save'}
          busy={busy} error={problem} onSubmit={save} onCancel={() => setEditing(null)}>
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required data-autofocus /></label>
        </FormDialog>
      )}

      {deleting && (
        <ConfirmDialog title={`Delete ${deleting.name}?`} confirmLabel="Delete genre" danger busy={busy} error={problem}
          onConfirm={remove} onCancel={() => setDeleting(null)}>
          {deleting.book_count === 0 ? <p>No books use this genre.</p> : (
            <>
              <p>{deleting.book_count} book(s) use this genre. Choose what happens to them.</p>
              <label className="stack">
                Books go to
                <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                  <option value="">No genre</option>
                  {data.filter((g) => g.id !== deleting.id).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>
            </>
          )}
        </ConfirmDialog>
      )}
    </>
  )
}
