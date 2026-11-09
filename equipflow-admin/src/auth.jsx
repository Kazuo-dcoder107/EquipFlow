import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, clearToken, getToken, setToken, setUnauthorizedHandler } from './api'

// A React "context" shares data with every component below it without passing props through
// each level. Here it shares: who is logged in, and the login/logout actions.
const AuthContext = createContext(null)

const NOT_ADMIN = 'This account cannot use the admin site.'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // true while we check a token saved from an earlier visit
  const [loading, setLoading] = useState(Boolean(getToken()))

  const logout = useCallback(() => {
    clearToken()
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
      .then((me) => {
        if (me.role === 'admin') setUser(me)
        else clearToken() // a leftover non-admin token is never accepted here
      })
      .catch((err) => {
        if (err.status === 401) clearToken()
      })
      .finally(() => setLoading(false))
  }, [])

  async function login(username, password) {
    const { access_token } = await api.login(username, password)
    setToken(access_token)
    try {
      const me = await api.me()
      // The API already refuses other accounts at the admin login; this is a second check.
      if (me.role !== 'admin') throw new Error(NOT_ADMIN)
      setUser(me)
    } catch (err) {
      clearToken()
      throw err
    }
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
}

// A "hook" other components call to read the context: const { user } = useAuth()
export function useAuth() {
  return useContext(AuthContext)
}
