import { useAuth } from '../auth'
import { formatDateTime, formatDay } from '../utils/format'

// A few lines that appear only on paper (or in "Save as PDF"): which report, which dates, when it
// was made and by whom. On screen it is hidden (see .print-only in styles.css).
export default function PrintMeta({ title, fromDate, toDate }) {
  const { user } = useAuth()
  const period = fromDate || toDate
    ? `${fromDate ? formatDay(fromDate) : 'the beginning'} to ${toDate ? formatDay(toDate) : 'today'}`
    : 'All dates'
  return (
    <div className="print-only print-meta">
      <strong>{title}</strong>
      <p>Period: {period}</p>
      <p>Made {formatDateTime(new Date().toISOString())} by {user.full_name}</p>
    </div>
  )
}
