import { useState } from 'react'
import { api } from '../../api'
import { useApi } from '../../hooks/useApi'
import { TYPE_LABELS, peso } from '../../utils/format'
import Badge from '../../components/Badge'
import ConfirmDialog from '../../components/ConfirmDialog'
import EmptyState from '../../components/EmptyState'
import ErrorBox from '../../components/ErrorBox'
import FormDialog from '../../components/FormDialog'
import Loading from '../../components/Loading'

// Add / edit one category. The type cannot change once the category has items (the server also checks).
function CategoryForm({ category, onDone, onCancel }) {
  const [form, setForm] = useState(category
    ? { name: category.name, type: category.type, loan_days: String(category.loan_days), fine_per_day: String(category.fine_per_day) }
    : { name: '', type: 'hardware', loan_days: '7', fine_per_day: '0' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value })
  const hasItems = (category?.equipment_count || 0) > 0

  async function save() {
    const loanDays = Number(form.loan_days)
    const fine = Number(form.fine_per_day)
    if (!Number.isInteger(loanDays) || loanDays < 1) return setError('Loan days must be a whole number, 1 or more.')
    if (!Number.isInteger(fine) || fine < 0) return setError('Fine per day must be a whole number of pesos, 0 or more.')
    const body = { name: form.name.trim(), type: form.type, loan_days: loanDays, fine_per_day: fine }
    setBusy(true)
    setError('')
    try {
      await (category ? api.updateCategory(category.id, body) : api.createCategory(body))
      onDone(category ? `Saved ${body.name}.` : `Added ${body.name}.`)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <FormDialog title={category ? `Edit ${category.name}` : 'Add a category'} submitLabel={category ? 'Save changes' : 'Add category'}
      busy={busy} error={error} onSubmit={save} onCancel={onCancel}>
      <label>Name<input value={form.name} onChange={set('name')} maxLength={80} required data-autofocus /></label>
      <div>
        <label htmlFor="category-type">Type</label>
        <select
          id="category-type"
          value={form.type}
          onChange={set('type')}
          disabled={hasItems}
        >
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        {hasItems && (
          <span className="hint">
            The type is fixed because this category already has items.
          </span>
        )}
      </div>
      <div className="two-cols">
        <label>Loan days<input inputMode="numeric" value={form.loan_days} onChange={set('loan_days')} /></label>
        <label>Fine per day (&#8369;)<input inputMode="numeric" value={form.fine_per_day} onChange={set('fine_per_day')} /></label>
      </div>
      <p className="hint">Loan days apply to new borrows. The fine rate applies when an item is returned.</p>
    </FormDialog>
  )
}

export default function Categories() {
  const { data, loading, error, reload } = useApi(() => api.categories(), [])
  const [editing, setEditing] = useState(null) // null | 'new' | a category
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [message, setMessage] = useState('')

  async function remove() {
    setBusy(true)
    setDeleteError('')
    try {
      await api.deleteCategory(deleting.id)
      setMessage(`Deleted ${deleting.name}.`)
      setDeleting(null)
      reload()
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="toolbar">
        <p className="muted small">Each category sets how long things can be borrowed and the fine for each late day.</p>
        <button type="button" className="btn btn-primary btn-small" onClick={() => setEditing('new')}>Add category</button>
      </div>

      {message && <p className="notice notice-ok" role="status">{message}</p>}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && data.length === 0 && <EmptyState title="No categories yet">Add one before you add items.</EmptyState>}

      {data && data.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Categories</caption>
            <thead><tr><th>Category</th><th>Type</th><th>Loan</th><th>Fine per day</th><th>Items</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td data-label="Category" className="person-cell"><strong>{c.name}</strong></td>
                  <td data-label="Type"><Badge tone="info">{TYPE_LABELS[c.type]}</Badge></td>
                  <td data-label="Loan">{c.loan_days} {c.loan_days === 1 ? 'day' : 'days'}</td>
                  <td data-label="Fine per day">{peso(c.fine_per_day)}</td>
                  <td data-label="Items">{c.equipment_count}</td>
                  <td data-label="Actions" className="actions">
                    <div className="row-actions">
                      <button type="button" className="btn btn-small" onClick={() => setEditing(c)}>Edit</button>
                      <button type="button" className="btn btn-small btn-danger" onClick={() => { setDeleteError(''); setDeleting(c) }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <CategoryForm category={editing === 'new' ? null : editing}
          onDone={(text) => { setEditing(null); setMessage(text); reload() }} onCancel={() => setEditing(null)} />
      )}

      {deleting && (
        <ConfirmDialog title={`Delete ${deleting.name}?`} confirmLabel="Delete category" danger busy={busy} error={deleteError}
          onConfirm={remove} onCancel={() => setDeleting(null)}>
          <p>{deleting.equipment_count > 0
            ? `${deleting.name} still has ${deleting.equipment_count} item(s), so it cannot be deleted. Move or delete those items first.`
            : 'The category is removed for good.'}</p>
        </ConfirmDialog>
      )}
    </>
  )
}
