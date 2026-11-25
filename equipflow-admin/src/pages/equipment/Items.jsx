import { useState } from 'react'
import { api } from '../../api'
import { useApi } from '../../hooks/useApi'
import { useDebounce } from '../../hooks/useDebounce'
import { CONDITION, EQUIPMENT_STATUS, TYPE_LABELS, peso, toPesos } from '../../utils/format'
import Badge from '../../components/Badge'
import ConfirmDialog from '../../components/ConfirmDialog'
import EmptyState from '../../components/EmptyState'
import ErrorBox from '../../components/ErrorBox'
import FormDialog from '../../components/FormDialog'
import Loading from '../../components/Loading'
import Pager from '../../components/Pager'

const PAGE_SIZE = 25
const BLANK = { tag_uid: '', name: '', category_id: '', genre_id: '', replacement_cost: '0', condition: 'good' }

// The add / edit form. Genres show only for categories of type "book".
function ItemForm({ item, categories, genres, onDone, onCancel }) {
  const [form, setForm] = useState(item
    ? {
      tag_uid: item.tag_uid || '', name: item.name, category_id: String(item.category_id), genre_id: item.genre_id ? String(item.genre_id) : '',
      replacement_cost: String(item.replacement_cost ?? 0), condition: item.condition
    }
    : BLANK)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value })

  const category = categories.find((c) => String(c.id) === form.category_id)
  const isBook = category?.type === 'book'

  async function save() {
    const cost = toPesos(form.replacement_cost)
    if (!form.category_id) return setError('Choose a category.')
    if (cost === null || Number.isNaN(cost)) return setError('Replacement cost must be a whole number of pesos.')
    const body = {
      tag_uid: form.tag_uid.trim(), name: form.name.trim(), category_id: Number(form.category_id),
      genre_id: isBook && form.genre_id ? Number(form.genre_id) : null, replacement_cost: cost, condition: form.condition,
    }
    setBusy(true)
    setError('')
    try {
      await (item ? api.updateEquipment(item.id, body) : api.createEquipment(body))
      onDone(item ? `Saved ${body.name}.` : `Added ${body.name}.`)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <FormDialog title={item ? `Edit ${item.name}` : 'Add an item'} submitLabel={item ? 'Save changes' : 'Add item'} busy={busy} error={error} onSubmit={save} onCancel={onCancel}>
      <label>Name<input value={form.name} onChange={set('name')} maxLength={120} required data-autofocus /></label>
      <div>
        <label htmlFor="tag-uid">Tag UID</label>
        <input
          id="tag-uid"
          value={form.tag_uid}
          onChange={set('tag_uid')}
          maxLength={32}
          required
          placeholder="e.g. 04A1B2C3"
          aria-describedby="tag-uid-hint"
        />
        <span id="tag-uid-hint" className="hint">
          The code on the item's RFID tag (4-32 letters or digits).
        </span>
      </div>
      <label>Category
        <select value={form.category_id} onChange={set('category_id')} required>
          <option value="">Choose...</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({TYPE_LABELS[c.type]})</option>)}
        </select>
      </label>
      {isBook && (
        <label>Genre
          <select value={form.genre_id} onChange={set('genre_id')}>
            <option value="">No genre</option>
            {genres.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
      )}
      <div className="two-cols">
        <label>Replacement cost (&#8369;)<input inputMode="numeric" value={form.replacement_cost} onChange={set('replacement_cost')} /></label>
        <label>Condition
          <select value={form.condition} onChange={set('condition')}>
            {Object.entries(CONDITION).map(([value, c]) => <option key={value} value={value}>{c.label}</option>)}
          </select>
        </label>
      </div>
    </FormDialog>
  )
}

export default function Items() {
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const [editing, setEditing] = useState(null) // null | 'new' | an item
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [message, setMessage] = useState('')

  const debounced = useDebounce(search)
  const categories = useApi(() => api.categories(), [])
  const genres = useApi(() => api.genres(), [])
  const list = useApi(
    () => api.equipment({ search: debounced.trim(), type, category_id: categoryId, status, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    [debounced, type, categoryId, status, page],
  )

  const filter = (setter) => (value) => { setter(value); setPage(0) }
  const items = list.data?.items || []
  const total = list.data?.total || 0
  const cats = categories.data || []
  const shownCats = type ? cats.filter((c) => c.type === type) : cats

  function chooseType(value) {
    setType(value)
    setCategoryId('') // a category from the other type would give an empty list
    setPage(0)
  }

  function saved(text) {
    setEditing(null)
    setMessage(text)
    list.reload()
    categories.reload() // category counts changed
    genres.reload()
  }

  async function remove() {
    setBusy(true)
    setDeleteError('')
    try {
      await api.deleteEquipment(deleting.id)
      setMessage(`Deleted ${deleting.name}.`)
      setDeleting(null)
      list.reload()
      categories.reload()
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="toolbar">
        <p className="muted small">{list.data ? `${total} ${total === 1 ? 'item' : 'items'}` : ''}</p>
        <button type="button" className="btn btn-primary btn-small" disabled={!categories.data} onClick={() => setEditing('new')}>Add item</button>
      </div>

      <div className="filters filters-4">
        <input type="search" placeholder="Search name or tag UID" aria-label="Search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0) }} />
        <select aria-label="Type" value={type} onChange={(e) => chooseType(e.target.value)}>
          <option value="">Books and equipment</option>
          {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select aria-label="Category" value={categoryId} onChange={(e) => filter(setCategoryId)(e.target.value)}>
          <option value="">All categories</option>
          {shownCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Status" value={status} onChange={(e) => filter(setStatus)(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(EQUIPMENT_STATUS).map(([value, s]) => <option key={value} value={value}>{s.label}</option>)}
        </select>
      </div>

      {message && <p className="notice notice-ok" role="status">{message}</p>}
      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {list.loading && items.length === 0 && <Loading />}
      {list.data && items.length === 0 && <EmptyState title="No items found">Try a different search or clear a filter.</EmptyState>}

      {items.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Items</caption>
            <thead><tr><th>Item</th><th>Category</th><th>Status</th><th>Condition</th><th>Cost</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td data-label="Item" className="person-cell">
                    <strong>{item.name}</strong>
                    <span className="muted small block">Asset No.: {item.asset_number}</span>
                    <span className="muted small block">Tag UID: {item.tag_uid}</span>
                  </td>
                  <td data-label="Category">
                    <div>{item.category}{item.genre && <span className="muted small block">{item.genre}</span>}</div>
                  </td>
                  <td data-label="Status"><Badge tone={EQUIPMENT_STATUS[item.status].tone}>{EQUIPMENT_STATUS[item.status].label}</Badge></td>
                  <td data-label="Condition"><Badge tone={CONDITION[item.condition].tone}>{CONDITION[item.condition].label}</Badge></td>
                  <td data-label="Cost">{peso(item.replacement_cost)}</td>
                  <td data-label="Actions" className="actions">
                    <div className="row-actions">
                      <button type="button" className="btn btn-small" onClick={() => setEditing(item)}>Edit</button>
                      <button type="button" className="btn btn-small btn-danger" onClick={() => { setDeleteError(''); setDeleting(item) }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={page} size={PAGE_SIZE} total={total} onChange={setPage} />

      {editing && (
        <ItemForm item={editing === 'new' ? null : editing} categories={cats} genres={genres.data || []}
          onDone={saved} onCancel={() => setEditing(null)} />
      )}

      {deleting && (
        <ConfirmDialog title={`Delete ${deleting.name}?`} confirmLabel="Delete item" danger busy={busy} error={deleteError}
          onConfirm={remove} onCancel={() => setDeleting(null)}>
          <p>The item is removed for good. Items that were ever borrowed keep their history and cannot be deleted.</p>
        </ConfirmDialog>
      )}
    </>
  )
}
