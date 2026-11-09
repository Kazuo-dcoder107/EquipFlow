import { useState } from 'react'
import { api } from '../api'
import { announceApprovalsChanged } from '../events'
import { useApi } from '../hooks/useApi'
import { ROLE_LABELS, formatDateTime } from '../utils/format'
import Avatar from '../components/Avatar'
import Badge from '../components/Badge'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import ErrorBox from '../components/ErrorBox'
import Loading from '../components/Loading'

const REASON_MAX = 300

// Teachers and staff who signed up and chose their role. They cannot borrow until an admin
// approves them here (rejecting removes the request; they can sign up again).
export default function Approvals() {
  const { data, loading, error, reload } = useApi(() => api.users({ status: 'pending_approval', limit: 100 }), [])

  const [working, setWorking] = useState(null) // id of the request being approved
  const [rejecting, setRejecting] = useState(null) // the request whose "Reject" dialog is open
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('') // what happened last, shown above the list
  const [problem, setProblem] = useState('')

  const requests = data?.items || []

  // Run a decision, then refresh the list and the number in the side menu.
  async function decide(run, done) {
    setProblem('')
    setMessage('')
    try {
      const result = await run()
      setMessage(done(result))
      announceApprovalsChanged()
      reload()
      return true
    } catch (err) {
      setProblem(err.message)
      return false
    }
  }

  async function approve(person) {
    setWorking(person.id)
    await decide(
      () => api.approveUser(person.id),
      () => `Approved ${person.full_name}. They can now link their ID card at the kiosk.`,
    )
    setWorking(null)
  }

  async function reject() {
    const person = rejecting
    setBusy(true)
    const ok = await decide(
      () => api.rejectUser(person.id, reason.trim()),
      (result) => `Rejected ${person.full_name}${result.emailed ? ' and sent them an email' : ' (no email was sent)'}.`,
    )
    setBusy(false)
    if (ok) {
      setRejecting(null)
      setReason('')
    }
  }

  function openReject(person) {
    setReason('')
    setProblem('')
    setRejecting(person)
  }

  return (
    <>
      <h1>Approvals</h1>
      <p className="muted">Teachers and staff choose their role when they sign up. Approve them so they can link their ID card.</p>

      {message && <p className="notice notice-ok" role="status">{message}</p>}
      {problem && !rejecting && <ErrorBox message={problem} />}

      {loading && !data && <Loading count={2} />}
      {error && <ErrorBox message={error} onRetry={reload} />}

      {data && requests.length === 0 && (
        <EmptyState title="No requests are waiting">New teacher and staff sign-ups will appear here.</EmptyState>
      )}

      {requests.map((person) => (
        <article key={person.id} className="card request">
          <Avatar name={person.full_name} size="lg" />
          <div className="request-body">
            <h3>{person.full_name} <Badge tone="info">{ROLE_LABELS[person.role] || person.role}</Badge></h3>
            <p className="muted small">{person.sr_code} &middot; {person.email}</p>
            <p className="muted small">
              Signed up {formatDateTime(person.created_at)}
              {person.department && <> &middot; {person.department}</>}
              {person.age && <> &middot; age {person.age}</>}
            </p>
          </div>
          <div className="request-actions">
            <button type="button" className="btn btn-small btn-primary" disabled={working === person.id} onClick={() => approve(person)}>
              {working === person.id ? 'Approving...' : 'Approve'}
            </button>
            <button type="button" className="btn btn-small btn-danger" disabled={working === person.id} onClick={() => openReject(person)}>
              Reject
            </button>
          </div>
        </article>
      ))}

      {rejecting && (
        <ConfirmDialog
          title={`Reject ${rejecting.full_name}?`}
          confirmLabel="Reject sign-up"
          danger
          busy={busy}
          error={problem}
          onConfirm={reject}
          onCancel={() => { setRejecting(null); setProblem('') }}
        >
          <p>
            The sign-up request is removed. {rejecting.full_name} can register again with the right details.
          </p>
          <label className="stack">
            Reason (optional)
            <textarea
              rows={3}
              maxLength={REASON_MAX}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Shown in the email to the person, if email is set up"
              data-autofocus
            />
            <span className="hint">{reason.length}/{REASON_MAX}</span>
          </label>
        </ConfirmDialog>
      )}
    </>
  )
}
