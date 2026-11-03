import { useAuth } from '../auth'

// Tells the person what they still need to do before they can borrow, based on their account.
// Shows nothing when the account is fully ready.
export default function StatusNotice() {
  const { user } = useAuth()

  if (user.status === 'pending_approval') {
    return (
      <div className="notice notice-warning">
        <strong>Waiting for approval</strong>
        <p>An admin is reviewing your {user.role} registration. You can link your ID card once it is approved.</p>
      </div>
    )
  }
  if (user.status === 'pending_enrollment') {
    return (
      <div className="notice notice-info">
        <strong>One more step</strong>
        <p>Link your ID card at the kiosk to start borrowing.</p>
      </div>
    )
  }
  if (user.rfid_linked && !user.rfid_active) {
    return (
      <div className="notice notice-danger">
        <strong>ID card deactivated</strong>
        <p>Your ID card can no longer be used. Ask an admin for a replacement.</p>
      </div>
    )
  }
  return null
}
