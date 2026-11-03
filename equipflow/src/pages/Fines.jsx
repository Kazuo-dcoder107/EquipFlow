import { api } from '../api'
import { useApi } from '../hooks/useApi'
import { peso } from '../utils/format'
import EmptyState from '../components/EmptyState'
import ErrorBox from '../components/ErrorBox'
import FineTicket from '../components/FineTicket'
import Loading from '../components/Loading'

// Unpaid fines first, then paid and waived ones (newest first within each group).
const ORDER = { unpaid: 0, paid: 1, waived: 2 }
const sortFines = (a, b) => ORDER[a.status] - ORDER[b.status] || new Date(b.created_at) - new Date(a.created_at)

export default function Fines() {
  const { data, loading, error, reload } = useApi(() => api.penalties({ limit: 100 }), [])
  const fines = [...(data?.items || [])].sort(sortFines)

  return (
    <>
      <h1>Fine tickets</h1>

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}

      {data && (
        <>
          <div className={`stat stat-wide ${data.unpaid_total > 0 ? 'stat-danger' : ''}`}>
            <strong>{peso(data.unpaid_total)}</strong>
            <span>Total unpaid</span>
          </div>
          {data.unpaid_total > 0 && (
            <p className="notice notice-warning small">You cannot borrow again until your unpaid fines are settled.</p>
          )}
          {fines.length === 0 && <EmptyState title="No fines">Return items on time and this stays empty.</EmptyState>}
          {fines.map((fine) => <FineTicket key={fine.id} fine={fine} />)}
        </>
      )}
    </>
  )
}
