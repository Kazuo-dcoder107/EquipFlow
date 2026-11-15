import { useState } from 'react'
import { api } from '../../api'
import { useApi } from '../../hooks/useApi'
import { FINE_TYPES, formatDateTime, localDay, peso } from '../../utils/format'
import { downloadCsv } from '../../utils/csv'
import EmptyState from '../../components/EmptyState'
import ErrorBox from '../../components/ErrorBox'
import Loading from '../../components/Loading'
import PrintMeta from '../../components/PrintMeta'

const PAGE = 200 // the most the server returns at once
const MAX_PAGES = 25

// The server has no "paid between these dates" filter, so fetch every paid (or waived) fine,
// a page at a time, and pick the dates here.
async function loadAll(status) {
  const items = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await api.penalties({ status, limit: PAGE, offset: page * PAGE })
    items.push(...result.items)
    if (items.length >= result.total || result.items.length === 0) break
  }
  return items
}

function Tile({ value, label }) {
  return <div className="tile"><strong>{value}</strong><span>{label}</span></div>
}

// Who paid their fines and when (date and time). Choose "Waived" to see the fines that were
// forgiven instead. The date range is about the day the fine was settled.
export default function FinesPaid() {
  const [status, setStatus] = useState('paid')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const badRange = fromDate && toDate && fromDate > toDate
  const paid = status === 'paid'

  const { data, loading, error, reload } = useApi(() => loadAll(status), [status])

  const rows = (data || [])
    .filter((f) => f.resolved_at)
    .filter((f) => (!fromDate || localDay(f.resolved_at) >= fromDate) && (!toDate || localDay(f.resolved_at) <= toDate))
    .sort((a, b) => b.resolved_at.localeCompare(a.resolved_at)) // newest first
  const total = rows.reduce((sum, f) => sum + f.amount, 0)
  const people = new Set(rows.map((f) => f.user_id)).size

  function download() {
    downloadCsv(`equipflow-fines-${status}${fromDate ? `-from-${fromDate}` : ''}${toDate ? `-to-${toDate}` : ''}.csv`, [
      [paid ? 'Date and time paid' : 'Date and time waived', 'SR-code / ID', 'Name', 'Item', 'Type', 'Amount (PHP)', 'Note'],
      ...rows.map((f) => [formatDateTime(f.resolved_at), f.sr_code, f.full_name, f.equipment_name, FINE_TYPES[f.type], f.amount, f.notes]),
      [],
      ['Total', '', '', '', '', total],
    ])
  }

  return (
    <>
      <PrintMeta title={paid ? 'Fines paid report' : 'Fines waived report'} fromDate={fromDate} toDate={toDate} />
      <div className="toolbar no-print">
        <p className="muted">Who settled a fine, and the date and time they did.</p>
        <span className="row-actions" style={{ flexDirection: 'row' }}>
          <button type="button" className="btn btn-small" disabled={!data || badRange} onClick={download}>Download CSV</button>
          <button type="button" className="btn btn-small btn-primary" disabled={!data || badRange} onClick={() => window.print()}>Print / Save as PDF</button>
        </span>
      </div>

      <div className="filters-dates no-print">
        <label>Show
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="paid">Paid fines</option>
            <option value="waived">Waived fines</option>
          </select>
        </label>
        <label>From<input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></label>
        <label>To<input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></label>
      </div>

      {badRange && <ErrorBox message="The start date must be before the end date." />}
      {loading && !data && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}

      {data && !badRange && (
        <>
          <section className="tiles" aria-label="Summary">
            <Tile value={rows.length} label={paid ? 'Payments' : 'Waived fines'} />
            <Tile value={peso(total)} label={paid ? 'Total collected' : 'Total waived'} />
            <Tile value={people} label={people === 1 ? 'Person' : 'People'} />
          </section>

          {rows.length === 0 ? (
            <EmptyState title={paid ? 'No fines were paid in this period.' : 'No fines were waived in this period.'} />
          ) : (
            <div className="table-wrap" style={{ marginTop: '1rem' }}>
              <table className="table">
                <caption className="sr-only">{paid ? 'Fines paid' : 'Fines waived'}</caption>
                <thead><tr><th>{paid ? 'Paid on' : 'Waived on'}</th><th>Person</th><th>Item</th><th>Type</th><th>Amount</th></tr></thead>
                <tbody>
                  {rows.map((f) => (
                    <tr key={f.id}>
                      <td data-label={paid ? 'Paid on' : 'Waived on'}>{formatDateTime(f.resolved_at)}</td>
                      <td data-label="Person" className="person-cell">
                        <strong>{f.full_name}</strong>
                        <span className="muted small block">{f.sr_code}</span>
                      </td>
                      <td data-label="Item"><div>{f.equipment_name}{f.notes && <span className="muted small block">{f.notes}</span>}</div></td>
                      <td data-label="Type">{FINE_TYPES[f.type]}</td>
                      <td data-label="Amount">{peso(f.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}
