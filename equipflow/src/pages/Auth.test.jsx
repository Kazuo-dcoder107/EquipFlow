import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { STUDENT, jsonResponse, mockApi, renderApp } from '../test/helpers'

const HOME_DATA = {
  'GET /api/me/summary': { borrowed_now: 0, overdue_now: 0, unpaid_total: 0 },
  'GET /api/me/transactions': { total: 0, items: [] },
  'GET /api/me/recommendations': { strategy: 'popular', borrowing_blocked: null, top_categories: [], top_genres: [], items: [] },
}

describe('protected pages', () => {
  it('send a visitor without a login to the sign-in page', async () => {
    mockApi({})
    renderApp('/loans', { loggedIn: false })
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('send a saved token that the server rejects back to sign-in', async () => {
    mockApi({ 'GET /api/auth/me': () => jsonResponse({ detail: 'Not authenticated' }, 401) })
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(localStorage.getItem('equipflow.token')).toBeNull()
  })
})

describe('Login page', () => {
  it('signs in, stores the token and lands on the home page', async () => {
    mockApi({
      'POST /api/auth/login': { access_token: 'tok123', role: 'student', full_name: 'Juan Dela Cruz' },
      'GET /api/auth/me': STUDENT,
      ...HOME_DATA,
    })
    renderApp('/login', { loggedIn: false })

    await userEvent.type(screen.getByLabelText('SR-code'), '24-0001')
    await userEvent.type(screen.getByLabelText('Password'), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Hello, Juan' })).toBeInTheDocument()
    expect(localStorage.getItem('equipflow.token')).toBe('tok123')
  })

  it('shows the error for a wrong password and stays on the page', async () => {
    mockApi({ 'POST /api/auth/login': () => jsonResponse({ detail: 'Incorrect SR-code or password' }, 401) })
    renderApp('/login', { loggedIn: false })

    await userEvent.type(screen.getByLabelText('SR-code'), '24-0001')
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect SR-code or password')
    expect(localStorage.getItem('equipflow.token')).toBeNull()
  })
})

describe('Register page', () => {
  async function fill(role) {
    await userEvent.selectOptions(screen.getByLabelText('I am a'), role)
    await userEvent.type(screen.getByLabelText('SR-code'), 'T-100')
    await userEvent.type(screen.getByLabelText('Full name'), 'Tess Teacher')
    await userEvent.type(screen.getByLabelText('Email'), 'tess@example.com')
    // the Register password label also contains its hint text, so match by its start
    await userEvent.type(screen.getByLabelText(/^Password/), 'password123')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'password123')
  }

  it('warns teachers and staff about approval, but not students', async () => {
    mockApi({})
    renderApp('/register', { loggedIn: false })
    expect(screen.queryByText(/need an admin's approval/)).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('I am a'), 'staff')
    expect(screen.getByText(/need an admin's approval/)).toBeInTheDocument()
  })

  it('sends the chosen role and explains the approval step', async () => {
    const fetchMock = mockApi({
      'POST /api/auth/register': () => jsonResponse({ id: 9, role: 'teacher', status: 'pending_approval' }, 201),
    })
    renderApp('/register', { loggedIn: false })
    await fill('teacher')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('heading', { name: 'Request sent' })).toBeInTheDocument()
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(sent).toEqual({
      sr_code: 'T-100', full_name: 'Tess Teacher', email: 'tess@example.com', password: 'password123', role: 'teacher',
    })
  })

  it('tells a student to link their ID card at the kiosk', async () => {
    mockApi({ 'POST /api/auth/register': () => jsonResponse({ id: 9, role: 'student', status: 'pending_enrollment' }, 201) })
    renderApp('/register', { loggedIn: false })
    await fill('student')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('heading', { name: 'Account created' })).toBeInTheDocument()
    expect(screen.getByText(/link your ID card at the kiosk/)).toBeInTheDocument()
  })

  it('catches mismatched passwords without calling the API', async () => {
    const fetchMock = mockApi({})
    renderApp('/register', { loggedIn: false })
    await fill('student')
    await userEvent.clear(screen.getByLabelText('Confirm password'))
    await userEvent.type(screen.getByLabelText('Confirm password'), 'different1')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(screen.getByRole('alert')).toHaveTextContent('do not match')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows what the API rejected, such as a duplicate SR-code', async () => {
    mockApi({ 'POST /api/auth/register': () => jsonResponse({ detail: 'SR-code already registered' }, 409) })
    renderApp('/register', { loggedIn: false })
    await fill('student')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('SR-code already registered'))
  })
})
