import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { useApi } from '../hooks/useApi'
import { firstName, peso } from '../utils/format'
import ErrorBox from '../components/ErrorBox'
import ItemCard from '../components/ItemCard'
import LoanCard from '../components/LoanCard'
import Loading from '../components/Loading'
import StatusNotice from '../components/StatusNotice'

// The first screen after login. Three separate calls fill three sections, so a problem in
// one section does not stop the others from showing.
export default function Home() {
  const { user } = useAuth()
  const summary = useApi(() => api.summary(), [])
  const loans = useApi(() => api.transactions({ limit: 200 }), [])
  const picks = useApi(() => api.recommendations(3), [])

  const dueSoon = (loans.data?.items || [])
    .filter((loan) => loan.state === 'borrowed' || loan.state === 'overdue')
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
    .slice(0, 3)

  return (
    <>
      <h1>Hello, {firstName(user.full_name)}</h1>
      <StatusNotice />

      {summary.error && <ErrorBox message={summary.error} onRetry={summary.reload} />}
      {summary.data && (
        <section className="stats">
          <div className="stat">
            <strong>{summary.data.borrowed_now}</strong>
            <span>Borrowed now</span>
          </div>
          <div className={`stat ${summary.data.overdue_now > 0 ? 'stat-danger' : ''}`}>
            <strong>{summary.data.overdue_now}</strong>
            <span>Overdue</span>
          </div>
          <div className={`stat ${summary.data.unpaid_total > 0 ? 'stat-danger' : ''}`}>
            <strong>{peso(summary.data.unpaid_total)}</strong>
            <span>Unpaid fines</span>
          </div>
        </section>
      )}

      <section>
        <div className="section-head">
          <h2>Due soon</h2>
          <Link to="/loans">All loans</Link>
        </div>
        {loans.loading && <Loading />}
        {loans.error && <ErrorBox message={loans.error} onRetry={loans.reload} />}
        {loans.data && dueSoon.length === 0 && <p className="muted">Nothing is borrowed right now.</p>}
        {dueSoon.map((loan) => <LoanCard key={loan.id} loan={loan} />)}
      </section>

      <section>
        <div className="section-head">
          <h2>Recommended for you</h2>
          <Link to="/recommended">See all</Link>
        </div>
        {picks.loading && <Loading />}
        {picks.error && <ErrorBox message={picks.error} onRetry={picks.reload} />}
        {picks.data && picks.data.items.length === 0 && <p className="muted">No suggestions yet.</p>}
        {picks.data?.items.map((item) => <ItemCard key={item.id} item={item} reason={item.reason} />)}
      </section>
    </>
  )
}
