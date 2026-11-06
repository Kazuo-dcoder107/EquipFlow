import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'

// Tells the person what they still need to do, based on their account. More than one notice can
// apply at once (for example a student who must link an ID card AND finish their profile).
// Shows nothing when the account is fully ready.
export default function StatusNotice() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const notices = []

  if (user.status === 'pending_approval') {
    notices.push(
      <div key="approval" className="notice notice-warning">
        <strong>Waiting for approval</strong>
        <p>An admin is reviewing your {user.role} registration. You can link your ID card once it is approved.</p>
      </div>,
    )
  } else if (user.status === 'pending_enrollment') {
    notices.push(
      <div key="enroll" className="notice notice-info">
        <strong>One more step</strong>
        <p>Link your ID card at the kiosk to start borrowing.</p>
      </div>,
    )
  } else if (user.rfid_linked && !user.rfid_active) {
    notices.push(
      <div key="card" className="notice notice-danger">
        <strong>ID card deactivated</strong>
        <p>Your ID card can no longer be used. Ask an admin for a replacement.</p>
      </div>,
    )
  }

  // A student who has not given age, department, year level and program yet
  if (user.profile_complete === false) {
    notices.push(
      <div key="profile" className="notice notice-warning">
        <strong>Complete your profile</strong>
        <p>
          Add your age, department, year level and program.{' '}
          {pathname !== '/profile' && <Link to="/profile">Go to profile</Link>}
        </p>
      </div>,
    )
  }

  return notices.length ? <>{notices}</> : null
}
