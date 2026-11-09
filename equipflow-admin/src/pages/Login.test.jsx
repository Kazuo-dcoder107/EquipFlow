import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, STATS, baseRoutes, jsonResponse, mockApi, renderApp, usersPage } from '../test/helpers'

async function signIn(username = 'admin', password = 'password123') {
  await userEvent.type(screen.getByLabelText('Username'), username)
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

const dashboard = { ...baseRoutes(), 'GET /api/dashboard/stats': STATS }

describe('admin sign-in', () => {
  it('signs in at the admin endpoint, saves the token and shows the dashboard', async () => {
    const fetchMock = mockApi({
      'POST /api/auth/admin/login': { access_token: 'tok123', role: 'admin', full_name: 'Demo Admin' },
      ...dashboard,
    })
    renderApp('/login', { loggedIn: false })
    await signIn()

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(localStorage.getItem('equipflow-admin.token')).toBe('tok123')
    expect(fetchMock.mock.calls[0][0].toString()).toContain('/api/auth/admin/login')
  })

  it('shows the API message for a wrong password or a non-admin account, and stays signed out', async () => {
    mockApi({ 'POST /api/auth/admin/login': () => jsonResponse({ detail: 'Incorrect username or password' }, 401) })
    renderApp('/login', { loggedIn: false })
    await signIn('24-0001', 'password123') // a student's SR-code is refused here by the API

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect username or password')
    expect(localStorage.getItem('equipflow-admin.token')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('refuses a token that turns out not to belong to an admin, even if the API let it through', async () => {
    mockApi({
      'POST /api/auth/admin/login': { access_token: 'tok', role: 'student', full_name: 'Juan' },
      'GET /api/auth/me': { ...ADMIN, role: 'student' },
    })
    renderApp('/login', { loggedIn: false })
    await signIn()

    expect(await screen.findByRole('alert')).toHaveTextContent('cannot use the admin site')
    expect(localStorage.getItem('equipflow-admin.token')).toBeNull()
  })

  it('says it is for administrators and points everyone else to the other site', () => {
    mockApi({})
    renderApp('/login', { loggedIn: false })
    expect(screen.getByText('For administrators only.')).toBeInTheDocument()
    expect(screen.getByText(/sign in on the EquipFlow site instead/)).toBeInTheDocument()
    expect(screen.queryByText(/register|create an account/i)).not.toBeInTheDocument() // admins are never self-registered
  })
})

describe('protected pages', () => {
  it('send a visitor without a login to the sign-in page', async () => {
    mockApi({})
    renderApp('/users', { loggedIn: false })
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('send a saved token the server rejects back to sign-in, and forget it', async () => {
    mockApi({ 'GET /api/auth/me': () => jsonResponse({ detail: 'Not authenticated' }, 401) })
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(localStorage.getItem('equipflow-admin.token')).toBeNull()
  })

  it('never accept a leftover token from a non-admin account', async () => {
    mockApi({ 'GET /api/auth/me': { ...ADMIN, role: 'teacher' } })
    renderApp('/approvals')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(localStorage.getItem('equipflow-admin.token')).toBeNull()
  })

  it('open the page that was asked for after signing in', async () => {
    mockApi({
      'POST /api/auth/admin/login': { access_token: 'tok', role: 'admin', full_name: 'A' },
      ...baseRoutes(),
      'GET /api/departments/overview': [],
    })
    renderApp('/users', { loggedIn: false })
    await signIn()
    expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument()
  })

  it('sign out returns to the sign-in page and forgets the token', async () => {
    mockApi({ ...dashboard })
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(localStorage.getItem('equipflow-admin.token')).toBeNull()
  })

  it('show a page-not-found message for an unknown address', async () => {
    mockApi({ ...dashboard })
    renderApp('/nope')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })
})
