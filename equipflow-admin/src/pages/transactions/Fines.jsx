import { useState } from 'react'
import { api } from '../../api'
import { useApi } from '../../hooks/useApi'
import { useDebounce } from '../../hooks/useDebounce'
import { FINE_STATUS, FINE_TYPES, formatDate, peso } from '../../utils/format'
import Badge from '../../components/Badge'
import ConfirmDialog from '../../components/ConfirmDialog'
import EmptyState from '../../components/EmptyState'
import ErrorBox from '../../components/ErrorBox'
import Loading from '../../components/Loading'
import Pager from '../../components/Pager'

const PAGE_SIZE = 25

// What each button does, in words the admin sees before confirming.
const SETTLE = {
  paid: { title: 'Mark as paid?', confirm: 'Mark paid', text: (f) => `${f.full_name} paid ${peso(f.amount)}.`, done: (f) => `Marked ${f.full_name}'s fine as paid.` },
  waived: { title: 'Waive this fine?', confirm: 'Waive fine', text: (f) => `${f.full_name} no longer has to pay ${peso(f.amount)}, for example because a lost item turned up.`, done: (f) => `Waived ${f.full_name}'s fine.` },
  unpaid: { title: 'Set back to unpaid?', confirm: 'Set unpaid', text: (f) => `Use this to fix a mistake. ${f.full_name} owes ${peso(f.amount)} again.`, done: (f) => `${f.full_name}'s fine is unpaid again.` },
}

export default function Fines() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('unpaid') // what an admin usually wants to see
  const [type, setType] = useState('')
  const [page, setPage] = useState(0)
  const [action, setAction] = useState(null) // { to: 'paid' | 'waived' | 'unpaid', fine }
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [message, setMessage] = useState('')

  const debounced = useDebounce(search)
  const list = useApi(
    () => api.penalties({ search: debounced.trim(), status, type, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    [debounced, status, type, page],
  )
  const filter = (setter) => (value) => { setter(value); setPage(0) }
  const items = list.data?.items || []
  const total = list.data?.total || 0

  function ask(to, fine) {
    setProblem('')
    setNotes('')
    setAction({ to, fine })
  }

  async function confirm() {
    const { to, fine } = action
    setBusy(true)
    setProblem('')
    try {
      await api.settlePenalty(fine.id, to, notes.trim())
      setMessage(SETTLE[to].done(fine))
      setAction(null)
      list.reload()
    } catch (err) {
      setProblem(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="filters filters-3">
        <input type="search" placeholder="Search person, SR-code / ID or item" aria-label="Search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0) }} />
        <select aria-label="Status" value={status} onChange={(e) => filter(setStatus)(e.target.value)}>
          <option value="">All fines</option>
          {Object.entries(FINE_STATUS).map(([value, s]) => <option key={value} value={value}>{s.label}</option>)}
        </select>
        <select aria-label="Type" value={type} onChange={(e) => filter(setType)(e.target.value)}>
          <option value="">All types</option>
          {Object.entries(FINE_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {list.data && <p className="muted" data-testid="unpaid-total">Unpaid in this list: <strong>{peso(list.data.unpaid_total)}</strong></p>}
      {message && <p className="notice notice-ok" role="status">{message}</p>}
      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {list.loading && items.length === 0 && <Loading />}
      {list.data && items.length === 0 && <EmptyState title="No fines found">Nothing matches these filters.</EmptyState>}

      {items.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Fines</caption>
            <thead><tr><th>Person</th><th>Item</th><th>Type</th><th>Amount</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {items.map((fine) => (
                <tr key={fine.id}>
                  <td data-label="Person" className="person-cell">
                    <strong>{fine.full_name}</strong>
                    <span className="muted small block">{fine.sr_code}</span>
                  </td>
                  <td data-label="Item">
                    <div>{fine.equipment_name}<span className="muted small block">{formatDate(fine.created_at)}{fine.notes ? ` · ${fine.notes}` : ''}</span></div>
                  </td>
                  <td data-label="Type">{FINE_TYPES[fine.type]}</td>
                  <td data-label="Amount">{peso(fine.amount)}</td>
                  <td data-label="Status"><Badge tone={FINE_STATUS[fine.status].tone}>{FINE_STATUS[fine.status].label}</Badge></td>
                  <td data-label="Actions" className="actions">
                    <div className="row-actions">
                      {fine.status === 'unpaid' ? (
                        <>
                          <button type="button" className="btn btn-small btn-primary" onClick={() => ask('paid', fine)}>Mark paid</button>
                          <button type="button" className="btn btn-small" onClick={() => ask('waived', fine)}>Waive</button>
                        </>
                      ) : (
                        <button type="button" className="btn btn-small" onClick={() => ask('unpaid', fine)}>Set unpaid</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={page} size={PAGE_SIZE} total={total} onChange={setPage} />

      {action && (
        <ConfirmDialog title={SETTLE[action.to].title} confirmLabel={SETTLE[action.to].confirm} busy={busy} error={problem}
          onConfirm={confirm} onCancel={() => setAction(null)}>
          <p>{SETTLE[action.to].text(action.fine)}</p>
          <label className="stack">
            Note (optional)
            <input value={notes} maxLength={255} onChange={(e) => setNotes(e.target.value)} placeholder="For example: paid at the cashier" />
          </label>
        </ConfirmDialog>
      )}
    </>
  )
}
