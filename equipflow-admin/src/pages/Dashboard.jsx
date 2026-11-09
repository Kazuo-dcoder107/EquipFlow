import { Link } from 'react-router-dom'
import { api } from '../api'
import { useApi } from '../hooks/useApi'
import { formatDate, peso } from '../utils/format'
import EmptyState from '../components/EmptyState'
import ErrorBox from '../components/ErrorBox'
import Loading from '../components/Loading'

function Tile({ value, label, tone }) {
  return (
    <div className={`tile ${tone ? `tile-${tone}` : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

// The first screen after signing in: what needs attention, and how things stand right now.
export default function Dashboard() {
  const { data, loading, error, reload } = useApi(() => api.dashboard(), [])

  return (
    <>
      <h1>Dashboard</h1>

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}

      {data && (
        <>
          {(data.users.pending_approval > 0 || data.equipment.overdue > 0 || data.penalties.unpaid_count > 0) && (
            <section className="attention" aria-label="Needs attention">
              {data.users.pending_approval > 0 && (
                <Link to="/approvals" className="attention-item">
                  <strong>{data.users.pending_approval}</strong> sign-up {data.users.pending_approval === 1 ? 'request is' : 'requests are'} waiting for approval
                  <span className="attention-go">Review &rarr;</span>
                </Link>
              )}
              {data.equipment.overdue > 0 && (
                <p className="attention-item"><strong>{data.equipment.overdue}</strong> {data.equipment.overdue === 1 ? 'item is' : 'items are'} overdue</p>
              )}
              {data.penalties.unpaid_count > 0 && (
                <p className="attention-item"><strong>{data.penalties.unpaid_count}</strong> unpaid {data.penalties.unpaid_count === 1 ? 'fine' : 'fines'}, {peso(data.penalties.unpaid_total)} in total</p>
              )}
            </section>
          )}

          <h2>Equipment and books</h2>
          <section className="tiles">
            <Tile value={data.equipment.total} label="Total" />
            <Tile value={data.equipment.available} label="Available" tone="ok" />
            <Tile value={data.equipment.borrowed} label="Borrowed" tone="info" />
            <Tile value={data.equipment.overdue} label="Overdue" tone={data.equipment.overdue > 0 ? 'danger' : undefined} />
            <Tile value={data.equipment.missing} label="Missing" />
          </section>

          <h2>Today and people</h2>
          <section className="tiles">
            <Tile value={data.today.borrows} label="Borrowed today" />
            <Tile value={data.today.returns} label="Returned today" />
            <Tile value={data.users.enrolled} label="Students with ID card" />
            <Tile value={data.users.pending_enrollment} label="Waiting for ID card" />
            <Tile value={peso(data.penalties.unpaid_total)} label="Unpaid fines" tone={data.penalties.unpaid_total > 0 ? 'danger' : undefined} />
          </section>

          <h2>Overdue items</h2>
          {data.overdue_items.length === 0 ? (
            <EmptyState title="Nothing is overdue">Everything borrowed is within its due date.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Overdue items, most overdue first</caption>
                <thead>
                  <tr><th>Item</th><th>Borrowed by</th><th>Was due</th><th>Late</th><th>Fine so far</th></tr>
                </thead>
                <tbody>
                  {data.overdue_items.map((item) => (
                    <tr key={item.transaction_id}>
                      <td data-label="Item"><strong>{item.equipment_name}</strong><span className="muted small block">{item.category}</span></td>
                      <td data-label="Borrowed by">{item.full_name}<span className="muted small block">{item.sr_code}</span></td>
                      <td data-label="Was due">{formatDate(item.due_at)}</td>
                      <td data-label="Late"><span className="due-danger">{item.days_overdue} {item.days_overdue === 1 ? 'day' : 'days'}</span></td>
                      <td data-label="Fine so far">{peso(item.fine)}</td>
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
