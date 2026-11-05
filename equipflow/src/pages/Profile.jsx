import { useRef, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { useInstallPrompt } from '../hooks/useInstallPrompt'
import { PREFERENCES, useTheme } from '../theme'
import { prepareAvatar } from '../utils/image'
import { ROLE_LABELS } from '../utils/format'
import Avatar from '../components/Avatar'
import { CameraIcon, MonitorIcon, MoonIcon, SunIcon } from '../components/Icons'
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
  const { user, logout, refreshUser } = useAuth()
  const { canInstall, install } = useInstallPrompt()
  const { preference, setPreference } = useTheme()

  const fileInput = useRef(null)
  const [busy, setBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')

  // Run a photo action (upload or remove), then reload the profile so every screen updates.
  async function changePhoto(action) {
    setPhotoError('')
    setBusy(true)
    try {
      await action()
      await refreshUser()
    } catch (err) {
      setPhotoError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function handleFile(event) {
    const file = event.target.files[0]
    event.target.value = '' // so choosing the same file again still triggers this
    if (file) changePhoto(async () => api.uploadAvatar(await prepareAvatar(file)))
  }

  return (
    <>
      <h1>Profile</h1>
      <StatusNotice />

      <section className="card photo-card">
        {/* The round photo is a mouse shortcut; the buttons beside it work for everyone. */}
        <button
          type="button"
          className="photo-frame"
          tabIndex={-1}
          aria-hidden="true"
          disabled={busy}
          onClick={() => fileInput.current.click()}
        >
          <Avatar size="xl" />
          <span className="photo-overlay"><CameraIcon size={26} /></span>
        </button>

        <div>
          <p className="photo-name">{user.full_name}</p>
          <p className="muted small">{ROLE_LABELS[user.role] || user.role}</p>
          <div className="photo-actions">
            <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => fileInput.current.click()}>
              {busy ? 'Saving...' : user.has_avatar ? 'Change photo' : 'Add photo'}
            </button>
            {user.has_avatar && (
              <button type="button" className="btn btn-small btn-danger" disabled={busy} onClick={() => changePhoto(() => api.deleteAvatar())}>
                Remove photo
              </button>
            )}
          </div>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Picture file"
          hidden
          onChange={handleFile}
        />
      </section>
      {photoError && <p className="form-error" role="alert">{photoError}</p>}

      <dl className="card details">
        <dt>SR-code</dt><dd>{user.sr_code}</dd>
        <dt>Email</dt><dd>{user.email}</dd>
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
