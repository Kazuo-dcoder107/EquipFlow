import { dueStatus, formatDate, peso } from '../utils/format'
import StatusBadge from './StatusBadge'

// One loan. `loan.state` decides what is shown: items still out show how long is left,
// finished loans show when they were returned.
export default function LoanCard({ loan }) {
  const isOut = loan.state === 'borrowed' || loan.state === 'overdue'
  const due = isOut ? dueStatus(loan.due_at) : null

  return (
    <article className="card">
      <div className="card-row">
        <div>
          <h3>{loan.equipment_name}</h3>
          <p className="muted">{loan.category}</p>
        </div>
        {isOut ? <span className={`due due-${due.tone}`}>{due.label}</span> : <StatusBadge status={loan.state} />}
      </div>

      <p className="muted small">
        Borrowed {formatDate(loan.borrowed_at)}
        {isOut ? ` \u00B7 Due ${formatDate(loan.due_at)}` : loan.returned_at && ` \u00B7 Returned ${formatDate(loan.returned_at)}`}
      </p>

      {loan.fine > 0 && (
        <p className={isOut ? 'fine-line' : 'muted small'}>
          {isOut ? `Fine so far: ${peso(loan.fine)}` : `Fine: ${peso(loan.fine)}`}
        </p>
      )}
    </article>
  )
}
