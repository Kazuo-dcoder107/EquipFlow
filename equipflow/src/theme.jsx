import { createContext, useCallback, useContext, useEffect, useState } from 'react'

// Light / dark mode. The person picks "system" (follow the phone), "light" or "dark".
// The choice is saved on the device and applied as <html data-theme="light|dark">;
// styles.css then swaps its colour variables for that theme.

const STORAGE_KEY = 'equipflow.theme'
export const PREFERENCES = ['system', 'light', 'dark']

// The colour of the phone's address bar for each theme (keep in sync with the top bar in
// styles.css and with the small script in index.html, which applies the theme before the
// page first draws so there is no white flash).
export const THEME_COLORS = { light: '#1d4ed8', dark: '#161b24' }

export const resolveTheme = (preference, systemIsDark) =>
  preference === 'system' ? (systemIsDark ? 'dark' : 'light') : preference

const darkQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)')

function readSavedPreference() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return PREFERENCES.includes(saved) ? saved : 'system'
  } catch {
    return 'system' // storage can be blocked (private mode); just follow the system
  }
}

function applyTheme(theme) {
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme // makes scrollbars and form controls match
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
}

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(readSavedPreference)
  const [systemIsDark, setSystemIsDark] = useState(() => Boolean(darkQuery()?.matches))

  // Follow the phone's setting while it changes (only matters when the preference is "system").
  useEffect(() => {
    const query = darkQuery()
    if (!query) return
    const onChange = (event) => setSystemIsDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolved = resolveTheme(preference, systemIsDark)
  useEffect(() => applyTheme(resolved), [resolved])

  const setPreference = useCallback((next) => {
    setPreferenceState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // not saved, but it still applies for this visit
    }
  }, [])

  // The quick button in the top bar flips between light and dark.
  const toggle = useCallback(
    () => setPreference(resolved === 'dark' ? 'light' : 'dark'),
    [resolved, setPreference],
  )

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
