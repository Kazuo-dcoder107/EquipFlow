// Small helpers that turn API values into text for the screen.

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

export function formatDate(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export const peso = (amount) => `\u20B1${Number(amount || 0).toLocaleString('en-PH')}`

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * How long until something is due? Returns { label, tone } where tone is one of
 * "danger" (late), "warning" (due within a day) or "ok".
 * Late days are rounded up, the same way the backend works out fines.
 */
export function dueStatus(dueIso, now = new Date()) {
  const remaining = new Date(dueIso) - now
  if (remaining < 0) {
    return { label: `Overdue by ${plural(Math.ceil(-remaining / DAY), 'day')}`, tone: 'danger' }
  }
  if (remaining < DAY) {
    return { label: `Due in ${plural(Math.max(1, Math.ceil(remaining / HOUR)), 'hour')}`, tone: 'warning' }
  }
  return { label: `Due in ${plural(Math.floor(remaining / DAY), 'day')}`, tone: 'ok' }
}

export const firstName = (fullName = '') => fullName.trim().split(/\s+/)[0] || ''

export const ROLE_LABELS = { student: 'Student', teacher: 'Teacher', staff: 'Staff', admin: 'Admin' }

export const PENALTY_LABELS = { overdue_fine: 'Late return', lost: 'Lost item', damaged: 'Damaged item' }

export const fineReference = (id) => `FINE-${String(id).padStart(6, '0')}`
