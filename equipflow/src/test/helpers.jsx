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

/** A fake Response carrying a picture (what GET /api/me/avatar returns). */
export const blobResponse = (content = 'jpeg-bytes') => ({
  ok: true,
  status: 200,
  blob: async () => new Blob([content], { type: 'image/jpeg' }),
})

/** The school's departments and programs, as GET /api/departments returns them (CET and
 * General Service have no programs, so students cannot choose them). */
export const DEPARTMENTS = [
  { id: 1, name: 'CICS', programs: [{ id: 1, name: 'Bachelor of Science in Information Technology' }, { id: 2, name: 'Bachelor of Science in Computer Science' }] },
  { id: 2, name: 'CAFAD', programs: [{ id: 3, name: 'Bachelor of Science in Architecture' }] },
  { id: 3, name: 'CET', programs: [] },
  { id: 4, name: 'COE', programs: [{ id: 4, name: 'Bachelor of Science in Civil Engineering' }] },
  { id: 5, name: 'General Service', programs: [] },
]

export const STUDENT = {
  id: 1, sr_code: '24-0001', full_name: 'Juan Dela Cruz', email: 'juan@example.com', role: 'student',
  status: 'active', rfid_linked: true, rfid_active: true, has_avatar: false, avatar_version: null,
  age: 20, department_id: 1, department: 'CICS', year_level: 3, program_id: 1,
  program: 'Bachelor of Science in Information Technology', profile_complete: true, created_at: '2026-01-01T00:00:00Z',
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
