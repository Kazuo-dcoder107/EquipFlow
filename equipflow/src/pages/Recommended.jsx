import { api } from '../api'
import { useApi } from '../hooks/useApi'
import EmptyState from '../components/EmptyState'
import ErrorBox from '../components/ErrorBox'
import ItemCard from '../components/ItemCard'
import Loading from '../components/Loading'

// What the API says when it cannot let this person borrow right now
const BLOCKED = {
  unpaid_fine: 'You have an unpaid fine. Settle it before borrowing again.',
  has_overdue: 'You have an overdue item. Return it before borrowing again.',
}

export default function Recommended() {
  const { data, loading, error, reload } = useApi(() => api.recommendations(10), [])

  return (
    <>
      <h1>Recommended for you</h1>

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}

      {data && (
        <>
          {data.borrowing_blocked && <p className="notice notice-warning small">{BLOCKED[data.borrowing_blocked]}</p>}

          {data.strategy === 'history' ? (
            <p className="muted small">
              Based on what you borrow most
              {data.top_categories.length > 0 && <>: {data.top_categories.map((c) => c.name).join(', ')}</>}
              {data.top_genres.length > 0 && <> &middot; {data.top_genres.map((g) => g.name).join(', ')}</>}.
            </p>
          ) : (
            <p className="muted small">Borrow a few things and these suggestions will match your habits. For now, here is what is popular.</p>
          )}

          {data.items.length === 0 && <EmptyState title="Nothing to suggest right now">Check back when more items are available.</EmptyState>}
          {data.items.map((item) => <ItemCard key={item.id} item={item} reason={item.reason} />)}
        </>
      )}
    </>
  )
}
