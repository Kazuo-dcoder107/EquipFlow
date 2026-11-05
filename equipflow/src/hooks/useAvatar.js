import { useEffect, useState } from 'react'
import { api } from '../api'

// The photo needs the login token, so it is downloaded with fetch and shown from memory
// (an "object URL") instead of a plain <img src>. Several parts of a page show the same photo
// (top bar, greeting, profile), so one download is shared through this cache.
const cache = new Map() // "userId:version" -> Promise of the object URL

const keyFor = (user) => `${user.id}:${user.avatar_version}`

function load(user) {
  const key = keyFor(user)
  if (!cache.has(key)) {
    // This person's older photo versions are dropped once the new one has arrived
    const older = [...cache].filter(([k]) => k.startsWith(`${user.id}:`))
    const promise = api.avatar(user.avatar_version).then((picture) => URL.createObjectURL(picture))
    promise.then(
      () => older.forEach(([k, p]) => { cache.delete(k); p.then((url) => URL.revokeObjectURL(url)) }),
      () => cache.delete(key), // a failed download can be tried again next time
    )
    cache.set(key, promise)
  }
  return cache.get(key)
}

/** Forget every downloaded photo (used when someone logs out). */
export function clearAvatarCache() {
  cache.forEach((promise) => promise.then((url) => URL.revokeObjectURL(url), () => {}))
  cache.clear()
}

/** The address to show for this user's photo, or null (no photo, still loading, or failed). */
export function useAvatarUrl(user) {
  const [url, setUrl] = useState(null)
  const wanted = user?.has_avatar ? keyFor(user) : null

  useEffect(() => {
    if (!wanted) {
      setUrl(null)
      return
    }
    let ignore = false
    load(user)
      .then((address) => { if (!ignore) setUrl(address) })
      .catch(() => { if (!ignore) setUrl(null) })
    return () => { ignore = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted])

  return wanted ? url : null
}
