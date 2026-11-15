import { useState } from 'react'
import { api } from '../../api'
import { useApi } from '../../hooks/useApi'
import { useDebounce } from '../../hooks/useDebounce'
import { LOAN_STATE, formatDate, peso, toPesos } from '../../utils/format'
import Badge from '../../components/Badge'
import EmptyState from '../../components/EmptyState'
import ErrorBox from '../../components/ErrorBox'
import FormDialog from '../../components/FormDialog'
import Loading from '../../components/Loading'
import Pager from '../../components/Pager'

const PAGE_SIZE = 25

// "Mark lost" and "Mark damaged" share one dialog. Lost: the amount is optional (the item's
// replacement cost is used). Damaged: the amount is required.
function IncidentDialog({ kind, loan, onDone, onCancel }) {
  const lost = kind === 'lost'
  const [amount, setAmount] = useState('')
  const [condition, setCondition] = useState('damaged')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    const pesos = toPesos(amount)
    if (Number.isNaN(pesos) || pesos === 0) return setError('The amount must be a whole number of pesos, 1 or more.')
    if (!lost && pesos === null) return setError('Enter how much to charge.')
    setBusy(true)
    setError('')
    try {
      const result = lost
        ? await api.markLost(loan.equipment_id, { ...(pesos ? { amount: pesos } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}) })
        : await api.markDamaged(loan.equipment_id, { amount: pesos, condition, transaction_id: loan.id, ...(notes.trim() ? { notes: notes.trim() } : {}) })
      onDone(result.message)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <FormDialog title={lost ? `Mark ${loan.equipment_name} as lost?` : `Mark ${loan.equipment_name} as damaged?`}
      submitLabel={lost ? 'Mark lost' : 'Record damage'} danger busy={busy} error={error} onSubmit={submit} onCancel={onCancel}>
      <p>
        {lost
          ? `${loan.full_name} is charged and the loan closes as lost.`
          : `${loan.full_name} is charged for the damage.`}
      </p>
      <label>
        {lost ? 'Amount to charge (₱, optional)' : 'Amount to charge (₱)'}
        <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} data-autofocus
          placeholder={lost ? 'Leave empty to use the replacement cost' : ''} />
      </label>
      {!lost && (
        <label>Condition afterwards
          <select value={condition} onChange={(e) => setCondition(e.target.value)}>
            <option value="damaged">Damaged</option>
            <option value="needs_maintenance">Needs maintenance</option>
          </select>
        </label>
      )}
      <label>Note (optional)<input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={255} /></label>
    </FormDialog>
  )
}

export default function Loans() {
  const [search, setSearch] = useState('')
  const [state, setState] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(0)
  const [incident, setIncident] = useState(null) // { kind: 'lost' | 'damaged', loan }
  const [message, setMessage] = useState('')

  const debounced = useDebounce(search)
  const list = useApi(
    () => api.transactions({ search: debounced.trim(), state, from_date: fromDate, to_date: toDate, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    [debounced, state, fromDate, toDate, page],
  )
  const filter = (setter) => (value) => { setter(value); setPage(0) }
  const items = list.data?.items || []
  const total = list.data?.total || 0

  return (
    <>
      <div className="filters filters-3">
        <input type="search" placeholder="Search person, SR-code / ID or item" aria-label="Search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0) }} />
        <select aria-label="State" value={state} onChange={(e) => filter(setState)(e.target.value)}>
          <option value="">All loans</option>
          {Object.entries(LOAN_STATE).map(([value, s]) => <option key={value} value={value}>{s.label}</option>)}
        </select>
        <span />
      </div>
      <div className="filters-dates">
        <label>Borrowed from<input type="date" value={fromDate} onChange={(e) => filter(setFromDate)(e.target.value)} /></label>
        <label>Borrowed until<input type="date" value={toDate} onChange={(e) => filter(setToDate)(e.target.value)} /></label>
      </div>

      {message && <p className="notice notice-ok" role="status">{message}</p>}
      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {list.loading && items.length === 0 && <Loading />}
      {list.data && items.length === 0 && <EmptyState title="No loans found">Try a different search or clear a filter.</EmptyState>}

      {items.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Loans</caption>
            <thead><tr><th>Item</th><th>Borrower</th><th>Due</th><th>State</th><th>Fine</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {items.map((loan) => {
                const out = loan.state === 'borrowed' || loan.state === 'overdue'
                return (
                  <tr key={loan.id}>
                    <td data-label="Item" className="person-cell">
                      <strong>{loan.equipment_name}</strong>
                      <span className="muted small block">{loan.category} &middot; borrowed {formatDate(loan.borrowed_at)}</span>
                    </td>
                    <td data-label="Borrower">
                      <div>{loan.full_name}<span className="muted small block">{loan.sr_code}</span></div>
                    </td>
                    <td data-label="Due">
                      <div className={loan.state === 'overdue' ? 'due-danger' : undefined}>
                        {formatDate(loan.due_at)}
                        {loan.returned_at && <span className="muted small block">returned {formatDate(loan.returned_at)}</span>}
                      </div>
                    </td>
                    <td data-label="State"><Badge tone={LOAN_STATE[loan.state].tone}>{LOAN_STATE[loan.state].label}</Badge></td>
                    <td data-label="Fine">{loan.fine > 0 ? peso(loan.fine) : <span className="muted">-</span>}</td>
                    <td data-label="Actions" className="actions">
                      <div className="row-actions">
                        {out && <button type="button" className="btn btn-small btn-danger" onClick={() => setIncident({ kind: 'lost', loan })}>Mark lost</button>}
                        {loan.state !== 'lost' && <button type="button" className="btn btn-small" onClick={() => setIncident({ kind: 'damaged', loan })}>Mark damaged</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={page} size={PAGE_SIZE} total={total} onChange={setPage} />

      {incident && (
        <IncidentDialog kind={incident.kind} loan={incident.loan} onCancel={() => setIncident(null)}
          onDone={(text) => { setIncident(null); setMessage(text); list.reload() }} />
      )}
    </>
  )
}
