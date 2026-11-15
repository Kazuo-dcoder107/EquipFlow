// Small helpers that turn API values into text for the screen.

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

export const firstName = (fullName = '') => fullName.trim().split(/\s+/)[0] || ''

export const initial = (fullName = '') => fullName.trim().charAt(0).toUpperCase() || '?'

export const ROLE_LABELS = { student: 'Student', teacher: 'Teacher', staff: 'Staff', admin: 'Admin' }

export const STATUS_LABELS = {
  active: 'Active',
  pending_approval: 'Waiting for approval',
  pending_enrollment: 'Waiting for ID card',
}

export const YEAR_LABELS = { 1: '1st year', 2: '2nd year', 3: '3rd year', 4: '4th year', 5: '5th year' }

/** "Card" status text for a person's RFID/NFC ID tag. */
export function cardStatus(user) {
  if (!user.rfid_linked) return { label: 'Not linked', tone: 'muted' }
  return user.rfid_active ? { label: 'Linked', tone: 'ok' } : { label: 'Deactivated', tone: 'danger' }
}

export const TYPE_LABELS = { book: 'Book', hardware: 'Equipment' }

export const EQUIPMENT_STATUS = {
  available: { label: 'Available', tone: 'ok' },
  borrowed: { label: 'Borrowed', tone: 'info' },
  overdue: { label: 'Overdue', tone: 'danger' },
  missing: { label: 'Missing', tone: 'muted' },
}

export const CONDITION = {
  good: { label: 'Good', tone: 'ok' },
  needs_maintenance: { label: 'Needs maintenance', tone: 'warning' },
  damaged: { label: 'Damaged', tone: 'danger' },
}

export const LOAN_STATE = {
  borrowed: { label: 'Borrowed', tone: 'info' },
  overdue: { label: 'Overdue', tone: 'danger' },
  returned: { label: 'Returned', tone: 'ok' },
  lost: { label: 'Lost', tone: 'muted' },
}

export const FINE_TYPES = { overdue_fine: 'Late fine', lost: 'Lost item', damaged: 'Damaged item' }
export const FINE_STATUS = {
  unpaid: { label: 'Unpaid', tone: 'danger' },
  paid: { label: 'Paid', tone: 'ok' },
  waived: { label: 'Waived', tone: 'muted' },
}

/** Whole pesos from a text box: '' -> null, '25' -> 25, anything else -> NaN. */
export const toPesos = (text) => {
  const value = String(text).trim()
  return value === '' ? null : /^\d+$/.test(value) ? Number(value) : NaN
}

const pad = (n) => String(n).padStart(2, '0')

/** The local calendar day of a timestamp, as YYYY-MM-DD (what a date box gives back). */
export function localDay(iso) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "2026-03-05" (from a date box) as "Mar 5, 2026". */
export function formatDay(day) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}
