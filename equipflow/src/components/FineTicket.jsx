import { QRCodeSVG } from 'qrcode.react'
import { PENALTY_LABELS, fineReference, formatDate, peso } from '../utils/format'
import StatusBadge from './StatusBadge'

// A fine shown as a ticket. Unpaid tickets carry a QR code with the reference, so an admin
// can scan it at the counter and find the fine quickly.
export default function FineTicket({ fine }) {
  const reference = fineReference(fine.id)
  return (
    <article className={`card ticket ticket-${fine.status}`}>
      <div className="card-row">
        <div>
          <h3>{fine.equipment_name}</h3>
          <p className="muted">{PENALTY_LABELS[fine.type] || fine.type} &middot; {formatDate(fine.created_at)}</p>
        </div>
        <StatusBadge status={fine.status} />
      </div>

      <p className="ticket-amount">{peso(fine.amount)}</p>
      {fine.notes && <p className="muted small">{fine.notes}</p>}

      <div className="ticket-footer">
        <div>
          <p className="muted small">Reference</p>
          <p className="reference">{reference}</p>
          {fine.status === 'unpaid' && <p className="muted small">Show this at the counter to pay.</p>}
        </div>
        {fine.status === 'unpaid' && <QRCodeSVG value={`EQUIPFLOW-${reference}`} size={84} title={`QR code for ${reference}`} />}
      </div>
    </article>
  )
}
