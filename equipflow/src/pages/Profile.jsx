import { useAuth } from '../auth'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { PREFERENCES, useTheme } from '../theme'
import { ROLE_LABELS } from '../utils/format'
import { MonitorIcon, MoonIcon, SunIcon } from '../components/Icons'
import StatusNotice from '../components/StatusNotice'

const APPEARANCE = {
  system: { label: 'System', Icon: MonitorIcon },
  light: { label: 'Light', Icon: SunIcon },
  dark: { label: 'Dark', Icon: MoonIcon },
}

function cardStatus(user) {
  if (!user.rfid_linked) return 'Not linked yet'
  return user.rfid_active ? 'Linked and active' : 'Deactivated'
}

export default function Profile() {
  const { user, logout } = useAuth()
  const { canInstall, install } = useInstallPrompt()
  const { preference, setPreference } = useTheme()

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

      <fieldset className="card appearance">
        <legend>Appearance</legend>
        <div className="segmented">
          {PREFERENCES.map((value) => {
            const { label, Icon } = APPEARANCE[value]
            return (
              <label key={value} className={preference === value ? 'on' : ''}>
                <input
                  type="radio"
                  name="appearance"
                  value={value}
                  checked={preference === value}
                  onChange={() => setPreference(value)}
                />
                <Icon size={18} />
                {label}
              </label>
            )
          })}
        </div>
        <p className="muted small">System follows your phone's light or dark setting.</p>
      </fieldset>

      {canInstall && <button className="btn" onClick={install}>Install app on this device</button>}
      <button className="btn btn-danger" onClick={logout}>Sign out</button>
    </>
  )
}
