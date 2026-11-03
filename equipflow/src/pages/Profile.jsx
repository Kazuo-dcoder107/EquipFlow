import { useAuth } from '../auth'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { ROLE_LABELS } from '../utils/format'
import StatusNotice from '../components/StatusNotice'

function cardStatus(user) {
  if (!user.rfid_linked) return 'Not linked yet'
  return user.rfid_active ? 'Linked and active' : 'Deactivated'
}

export default function Profile() {
  const { user, logout } = useAuth()
  const { canInstall, install } = useInstallPrompt()

  return (
    <>
      <h1>Profile</h1>
      <StatusNotice />

      <dl className="card details">
        <dt>Name</dt><dd>{user.full_name}</dd>
        <dt>SR-code</dt><dd>{user.sr_code}</dd>
        <dt>Email</dt><dd>{user.email}</dd>
        <dt>Role</dt><dd>{ROLE_LABELS[user.role] || user.role}</dd>
        <dt>ID card</dt><dd>{cardStatus(user)}</dd>
      </dl>

      {canInstall && <button className="btn" onClick={install}>Install app on this device</button>}
      <button className="btn btn-danger" onClick={logout}>Sign out</button>
    </>
  )
}
