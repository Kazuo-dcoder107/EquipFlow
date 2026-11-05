import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { useAvatarUrl } from '../hooks/useAvatar'

/**
 * A round profile picture. Shows the uploaded photo when there is one, otherwise the first
 * letter of the name. `size` is "sm", "md", "lg" or "xl" (sizes are set in styles.css).
 * It is decorative (the name is always written next to it), so screen readers skip it.
 */
export default function Avatar({ user: given, size = 'md' }) {
  const { user: signedIn } = useAuth()
  const user = given || signedIn
  const url = useAvatarUrl(user)
  const [broken, setBroken] = useState(false)

  useEffect(() => setBroken(false), [url]) // a new picture gets a fresh chance to load

  const letter = (user.full_name || '?').trim().charAt(0).toUpperCase()

  return (
    <span className={`avatar-circle avatar-${size}`} aria-hidden="true">
      {url && !broken ? <img src={url} alt="" onError={() => setBroken(true)} /> : letter}
    </span>
  )
}
