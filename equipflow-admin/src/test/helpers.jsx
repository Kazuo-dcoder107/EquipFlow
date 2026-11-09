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
 * function (url, options) returning a Response. Every call is recorded in `fetch.mock.calls`.
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

export const ADMIN = {
  id: 1, sr_code: 'admin', full_name: 'Demo Admin', email: 'admin@example.com', role: 'admin',
  status: 'active', rfid_linked: false, rfid_active: true, has_avatar: false, avatar_version: null,
  age: null, department_id: null, department: null, year_level: null, program_id: null, program: null,
  profile_complete: true, created_at: '2026-01-01T00:00:00Z',
}

let nextId = 100
/** A person as GET /api/users returns them. */
export function person(overrides = {}) {
  const id = overrides.id ?? nextId++
  return {
    id, sr_code: `24-${id}`, full_name: `Person ${id}`, email: `p${id}@example.com`, role: 'student',
    status: 'active', rfid_linked: true, rfid_active: true, has_avatar: false, avatar_version: null,
    age: 20, department_id: 1, department: 'CICS', year_level: 2, program_id: 1,
    program: 'Bachelor of Science in Information Technology', profile_complete: true,
    created_at: '2026-03-01T08:30:00Z', ...overrides,
  }
}

export const usersPage = (items, total = items.length) => ({ total, items })

export const OVERVIEW = [
  { id: 1, name: 'CICS', members: 12, students: 10, programs: [
    { id: 1, name: 'Bachelor of Science in Information Technology', students: 7 },
    { id: 2, name: 'Bachelor of Science in Computer Science', students: 3 }] },
  { id: 2, name: 'CAFAD', members: 4, students: 3, programs: [{ id: 3, name: 'Bachelor of Science in Architecture', students: 3 }] },
  { id: 3, name: 'CET', members: 0, students: 0, programs: [] },
  { id: 4, name: 'COE', members: 6, students: 5, programs: [{ id: 4, name: 'Bachelor of Science in Civil Engineering', students: 5 }] },
  { id: 5, name: 'General Service', members: 2, students: 0, programs: [] },
]

export const STATS = {
  equipment: { total: 30, available: 21, borrowed: 6, overdue: 2, missing: 1 },
  users: { students: 40, enrolled: 35, pending_enrollment: 5, pending_approval: 3 },
  penalties: { unpaid_count: 4, unpaid_total: 180 },
  today: { borrows: 9, returns: 7 },
  overdue_items: [
    { transaction_id: 1, equipment_id: 3, equipment_name: 'Laptop 02', category: 'Laptop', sr_code: '24-0001', full_name: 'Juan Dela Cruz', due_at: '2026-03-01T08:00:00Z', days_overdue: 4, fine: 100 },
    { transaction_id: 2, equipment_id: 9, equipment_name: 'Clean Code', category: 'Book', sr_code: '24-0002', full_name: 'Maria Santos', due_at: '2026-03-04T08:00:00Z', days_overdue: 1, fine: 5 },
  ],
}

/** Render the whole site at `path`. With loggedIn, an admin token is already saved and /auth/me must be mocked. */
export function renderApp(path = '/', { loggedIn = true } = {}) {
  if (loggedIn) localStorage.setItem('equipflow-admin.token', 'test-token')
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

/** The routes every logged-in page needs (who am I, and how many approvals are waiting). */
export const baseRoutes = (waiting = 0) => ({
  'GET /api/auth/me': ADMIN,
  'GET /api/users': (url) => (new URL(url).searchParams.get('status') === 'pending_approval' && new URL(url).searchParams.get('limit') === '1'
    ? jsonResponse(usersPage([], waiting)) : jsonResponse(usersPage([]))),
})
