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
