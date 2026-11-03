import { useState } from 'react'
import { api } from '../api'
import { useApi } from '../hooks/useApi'
import EmptyState from '../components/EmptyState'
import ErrorBox from '../components/ErrorBox'
import LoanCard from '../components/LoanCard'
import Loading from '../components/Loading'

const byNewest = (a, b) => new Date(b.borrowed_at) - new Date(a.borrowed_at)

export default function MyLoans() {
  const [tab, setTab] = useState('current')
  const { data, loading, error, reload } = useApi(() => api.transactions({ limit: 200 }), [])

  // One call, then split the list in two.
  const all = data?.items || []
  const current = all
    .filter((loan) => loan.state === 'borrowed' || loan.state === 'overdue')
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at)) // soonest due first
  const history = all.filter((loan) => loan.state === 'returned' || loan.state === 'lost').sort(byNewest)
  const shown = tab === 'current' ? current : history

  return (
    <>
      <h1>My loans</h1>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'current'} className={tab === 'current' ? 'on' : ''} onClick={() => setTab('current')}>
          Borrowed now{data && ` (${current.length})`}
        </button>
        <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>
          History{data && ` (${history.length})`}
        </button>
      </div>

      {loading && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}

      {data && shown.length === 0 && (
        tab === 'current'
          ? <EmptyState title="Nothing borrowed right now">Tap your ID at the kiosk, then scan an item to borrow it.</EmptyState>
          : <EmptyState title="No history yet" />
      )}
      {shown.map((loan) => <LoanCard key={loan.id} loan={loan} />)}
    </>
  )
}
