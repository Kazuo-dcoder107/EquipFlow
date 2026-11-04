import { vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../auth'
import { ThemeProvider } from '../theme'
import App from '../App'

/** A fake `fetch` Response. */
export function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

/**
 * Replace the browser's fetch with a fake. `routes` maps "METHOD /path" to either a body or a
 * function returning a Response. Every call is recorded in `fetch.mock.calls`.
 */
export function mockApi(routes) {
  const fetchMock = vi.fn(async (url, options = {}) => {
    const { pathname } = new URL(url)
    const key = `${options.method || 'GET'} ${pathname}`
    if (!(key in routes)) throw new Error(`Unexpected request: ${key}`)
    const handler = routes[key]
    return typeof handler === 'function' ? handler(url, options) : jsonResponse(handler)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export const STUDENT = {
  id: 1, sr_code: '24-0001', full_name: 'Juan Dela Cruz', email: 'juan@example.com', role: 'student',
  status: 'active', rfid_linked: true, rfid_active: true, created_at: '2026-01-01T00:00:00Z',
}

const HOUR = 3600 * 1000
export const hoursFromNow = (h) => new Date(Date.now() + h * HOUR).toISOString()

export function loan(overrides = {}) {
  return {
    id: 1, equipment_id: 1, equipment_name: 'Laptop 05', category: 'Laptop', type: 'hardware',
    user_id: 1, sr_code: '24-0001', full_name: 'Juan Dela Cruz',
    borrowed_at: hoursFromNow(-24), due_at: hoursFromNow(48), returned_at: null,
    state: 'borrowed', fine: 0, ...overrides,
  }
}

/** Render the whole app at `path`, logged in as a saved-token user. */
export function renderApp(path = '/', { loggedIn = true } = {}) {
  if (loggedIn) localStorage.setItem('equipflow.token', 'test-token')
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    </ThemeProvider>,
  )
}
