import StatusBadge from './StatusBadge'

// One piece of equipment or one book. `reason` is only set on the "For you" list.
export default function ItemCard({ item, reason }) {
  return (
    <article className="card">
      <div className="card-row">
        <div>
          <h3>{item.name}</h3>
          <p className="muted">
            {item.category}
            {item.genre && <span className="chip">{item.genre}</span>}
          </p>
        </div>
        {item.status && <StatusBadge status={item.status} />}
      </div>
      {reason && <p className="reason">{reason}</p>}
    </article>
  )
}
