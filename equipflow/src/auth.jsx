import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, clearToken, getToken, setToken, setUnauthorizedHandler } from './api'
import { clearAvatarCache } from './hooks/useAvatar'

// A React "context" shares data with every component below it without passing props
// through each level. Here it shares: who is logged in, and the login/logout actions.
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // true while we check a token saved from an earlier visit
  const [loading, setLoading] = useState(Boolean(getToken()))

  const logout = useCallback(() => {
    clearToken()
    clearAvatarCache() // do not leave this person's photo in memory for the next user
    setUser(null)
  }, [])

  // If any API call gets a 401 (expired token), log out so the app returns to the login page.
  useEffect(() => {
    setUnauthorizedHandler(logout)
  }, [logout])

  // On first load: if there is a saved token, find out who it belongs to.
  useEffect(() => {
    if (!getToken()) return
    api
      .me()
      .then(setUser)
      .catch((err) => {
        if (err.status === 401) clearToken()
      })
      .finally(() => setLoading(false))
  }, [])

  async function login(srCode, password) {
    const { access_token } = await api.login(srCode, password)
    setToken(access_token)
    try {
      setUser(await api.me())
    } catch (err) {
      clearToken()
      throw err
    }
  }

  // Re-read the profile (e.g. after the person links their ID card at the kiosk)
  const refreshUser = useCallback(async () => setUser(await api.me()), [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

// A "hook" other components call to read the context: const { user } = useAuth()
export function useAuth() {
  return useContext(AuthContext)
}
