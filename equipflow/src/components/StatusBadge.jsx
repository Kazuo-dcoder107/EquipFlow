// A small coloured label such as "Available" or "Overdue".
// `status` can be an equipment status, a loan state or a fine status.
const BADGES = {
  // equipment
  available: { label: 'Available', tone: 'ok' },
  borrowed: { label: 'Borrowed', tone: 'info' },
  overdue: { label: 'Overdue', tone: 'danger' },
  missing: { label: 'Missing', tone: 'muted' },
  // loans (borrowed and overdue are shared with the equipment statuses above)
  returned: { label: 'Returned', tone: 'ok' },
  lost: { label: 'Lost', tone: 'muted' },
  // fines
  unpaid: { label: 'Unpaid', tone: 'danger' },
  paid: { label: 'Paid', tone: 'ok' },
  waived: { label: 'Waived', tone: 'muted' },
}

export default function StatusBadge({ status }) {
  const badge = BADGES[status] || { label: status, tone: 'muted' }
  return <span className={`badge badge-${badge.tone}`}>{badge.label}</span>
}
