import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEPARTMENTS, STUDENT, jsonResponse, mockApi, renderApp } from '../test/helpers'

// the registration request itself (the page also fetches the departments list with a GET)
const registrations = (fetchMock) => fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')

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

    await userEvent.type(screen.getByLabelText('SR-code or Staff ID'), '24-00001')
    await userEvent.type(screen.getByLabelText('Password'), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('heading', { name: 'Hello, Juan' })).toBeInTheDocument()
    expect(localStorage.getItem('equipflow.token')).toBe('tok123')
  })

  it('shows the error for a wrong password and stays on the page', async () => {
    mockApi({ 'POST /api/auth/login': () => jsonResponse({ detail: 'Incorrect SR-code or password' }, 401) })
    renderApp('/login', { loggedIn: false })

    await userEvent.type(screen.getByLabelText('SR-code or Staff ID'), '24-00001')
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect SR-code or password')
    expect(localStorage.getItem('equipflow.token')).toBeNull()
  })
})

describe('Register page', () => {
  async function fill(role) {
    await userEvent.selectOptions(screen.getByLabelText('I am a'), role)
    if (role === 'student') {
      await userEvent.type(screen.getByLabelText(/^SR-code/), '24-10001') // the e-mail is filled in from it
    } else {
      await userEvent.selectOptions(await screen.findByLabelText(/^Department/), 'CICS')
      await userEvent.type(screen.getByLabelText(/^(Teacher|Staff) ID/), 'cics 01') // shown and sent as CICS 01
      await userEvent.type(screen.getByLabelText(/^Email/), 'tess@g.batstate-u.edu.ph')
    }
    await userEvent.type(screen.getByLabelText('Full name'), 'Tess Teacher')
    // the Register password label also contains its hint text, so match by its start
    await userEvent.type(screen.getByLabelText(/^Password/), 'password123')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'password123')
    if (role === 'student') await fillAbout()
  }

  // students also give age, department, year level and program
  async function fillAbout() {
    await userEvent.type(await screen.findByLabelText(/^Age/), '20')
    await userEvent.selectOptions(screen.getByLabelText(/^Department/), 'CICS')
    await userEvent.selectOptions(screen.getByLabelText(/^Year level/), '3rd year')
    await userEvent.selectOptions(screen.getByLabelText(/^Program/), 'Bachelor of Science in Information Technology')
  }

  it('warns teachers and staff about approval, but not students', async () => {
    mockApi({ 'GET /api/departments': DEPARTMENTS })
    renderApp('/register', { loggedIn: false })
    expect(screen.queryByText(/need an admin's approval/)).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('I am a'), 'staff')
    expect(screen.getByText(/need an admin's approval/)).toBeInTheDocument()
  })

  it('sends the chosen role and explains the approval step', async () => {
    const fetchMock = mockApi({
      'GET /api/departments': DEPARTMENTS,
      'POST /api/auth/register': () => jsonResponse({ id: 9, role: 'teacher', status: 'pending_approval' }, 201),
    })
    renderApp('/register', { loggedIn: false })
    await fill('teacher')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('heading', { name: 'Request sent' })).toBeInTheDocument()
    const sent = JSON.parse(registrations(fetchMock)[0][1].body)
    expect(sent).toEqual({
      sr_code: 'CICS 01', full_name: 'Tess Teacher', email: 'tess@g.batstate-u.edu.ph', password: 'password123', role: 'teacher', department_id: 1,
    })
  })

  it('tells a student to link their ID card at the kiosk', async () => {
    mockApi({ 'GET /api/departments': DEPARTMENTS, 'POST /api/auth/register': () => jsonResponse({ id: 9, role: 'student', status: 'pending_enrollment' }, 201) })
    renderApp('/register', { loggedIn: false })
    await fill('student')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('heading', { name: 'Account created' })).toBeInTheDocument()
    expect(screen.getByText(/link your ID card at the kiosk/)).toBeInTheDocument()
  })

  it('catches mismatched passwords without calling the API', async () => {
    const fetchMock = mockApi({ 'GET /api/departments': DEPARTMENTS })
    renderApp('/register', { loggedIn: false })
    await fill('student')
    await userEvent.clear(screen.getByLabelText('Confirm password'))
    await userEvent.type(screen.getByLabelText('Confirm password'), 'different1')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(screen.getByRole('alert')).toHaveTextContent('do not match')
    expect(registrations(fetchMock)).toHaveLength(0)
  })

  it('shows what the API rejected, such as a duplicate SR-code', async () => {
    mockApi({ 'GET /api/departments': DEPARTMENTS, 'POST /api/auth/register': () => jsonResponse({ detail: 'SR-code already registered' }, 409) })
    renderApp('/register', { loggedIn: false })
    await fill('student')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('SR-code already registered'))
  })

  it('fills in a student\'s e-mail from the SR-code and does not let it be edited', async () => {
    mockApi({ 'GET /api/departments': DEPARTMENTS })
    renderApp('/register', { loggedIn: false })
    await userEvent.type(screen.getByLabelText(/^SR-code/), '24-10001')
    const email = screen.getByLabelText(/^Email/)
    expect(email).toHaveValue('24-10001@g.batstate-u.edu.ph')
    expect(email).toHaveAttribute('readonly')
  })

  it('refuses a malformed SR-code for a student without calling the API', async () => {
    const fetchMock = mockApi({ 'GET /api/departments': DEPARTMENTS })
    renderApp('/register', { loggedIn: false })
    await fill('student')
    await userEvent.clear(screen.getByLabelText(/^SR-code/))
    await userEvent.type(screen.getByLabelText(/^SR-code/), '24-0001')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByRole('alert')).toHaveTextContent('SR-code must look like 24-12345')
    expect(registrations(fetchMock)).toHaveLength(0)
  })

  it('does not accept an SR-code from a teacher or staff member', async () => {
    const fetchMock = mockApi({ 'GET /api/departments': DEPARTMENTS })
    renderApp('/register', { loggedIn: false })
    await userEvent.selectOptions(screen.getByLabelText('I am a'), 'teacher')
    await userEvent.selectOptions(await screen.findByLabelText(/^Department/), 'CICS')
    await userEvent.type(screen.getByLabelText(/^Teacher ID/), '24-10001')
    await userEvent.type(screen.getByLabelText(/^Email/), 'tess@g.batstate-u.edu.ph')
    await userEvent.type(screen.getByLabelText('Full name'), 'Tess Teacher')
    await userEvent.type(screen.getByLabelText(/^Password/), 'password123')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByRole('alert')).toHaveTextContent('do not use SR-codes')
    expect(registrations(fetchMock)).toHaveLength(0)
  })

  it('refuses a teacher e-mail outside @g.batstate-u.edu.ph', async () => {
    const fetchMock = mockApi({ 'GET /api/departments': DEPARTMENTS })
    renderApp('/register', { loggedIn: false })
    await userEvent.selectOptions(screen.getByLabelText('I am a'), 'staff')
    await userEvent.selectOptions(await screen.findByLabelText(/^Department/), 'CET')
    await userEvent.type(screen.getByLabelText(/^Staff ID/), 'CET 45')
    await userEvent.type(screen.getByLabelText(/^Email/), 'sam@gmail.com')
    await userEvent.type(screen.getByLabelText('Full name'), 'Sam Staff')
    await userEvent.type(screen.getByLabelText(/^Password/), 'password123')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByRole('alert')).toHaveTextContent('@g.batstate-u.edu.ph')
    expect(registrations(fetchMock)).toHaveLength(0)
  })
})

describe('Register: the ID must start with the person\'s department', () => {
  async function teacherForm(department, id) {
    await userEvent.selectOptions(screen.getByLabelText('I am a'), 'teacher')
    await userEvent.selectOptions(await screen.findByLabelText(/^Department/), department)
    await userEvent.type(screen.getByLabelText(/^Teacher ID/), id)
    await userEvent.type(screen.getByLabelText(/^Email/), 'tess@g.batstate-u.edu.ph')
    await userEvent.type(screen.getByLabelText('Full name'), 'Tess Teacher')
    await userEvent.type(screen.getByLabelText(/^Password/), 'password123')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'password123')
  }

  it('refuses an ID from another department', async () => {
    const fetchMock = mockApi({ 'GET /api/departments': DEPARTMENTS })
    renderApp('/register', { loggedIn: false })
    await teacherForm('CICS', 'CET 45')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(screen.getByRole('alert')).toHaveTextContent('must start with your department, CICS')
    expect(registrations(fetchMock)).toHaveLength(0)
  })

  it('shows the ID in capitals as it is typed', async () => {
    mockApi({ 'GET /api/departments': DEPARTMENTS })
    renderApp('/register', { loggedIn: false })
    await userEvent.selectOptions(screen.getByLabelText('I am a'), 'staff')
    await userEvent.type(await screen.findByLabelText(/^Staff ID/), 'cet 45')
    expect(screen.getByLabelText(/^Staff ID/)).toHaveValue('CET 45')
  })

  it('uses the chosen department\'s code as the example', async () => {
    mockApi({ 'GET /api/departments': DEPARTMENTS })
    renderApp('/register', { loggedIn: false })
    await userEvent.selectOptions(screen.getByLabelText('I am a'), 'teacher')
    await userEvent.selectOptions(await screen.findByLabelText(/^Department/), 'COE')
    expect(screen.getByLabelText(/^Teacher ID/)).toHaveAttribute('placeholder', 'COE 01')
  })

  it('cannot check the letters for a department without a code, such as General Service', async () => {
    const fetchMock = mockApi({ 'GET /api/departments': DEPARTMENTS, 'POST /api/auth/register': () => jsonResponse({ id: 9, role: 'teacher', status: 'pending_approval' }, 201) })
    renderApp('/register', { loggedIn: false })
    await teacherForm('General Service', 'GS 03')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('heading', { name: 'Request sent' })).toBeInTheDocument()
    expect(registrations(fetchMock)).toHaveLength(1)
  })
})

describe('Login page starts blank', () => {
  it('shows empty boxes again after signing out and coming back', async () => {
    mockApi({
      'POST /api/auth/login': { access_token: 'tok123', role: 'student', full_name: 'Juan Dela Cruz' },
      'GET /api/auth/me': STUDENT,
      ...HOME_DATA,
      'GET /api/departments': DEPARTMENTS,
    })
    renderApp('/login', { loggedIn: false })
    await userEvent.type(screen.getByLabelText('SR-code or Staff ID'), '24-00001')
    await userEvent.type(screen.getByLabelText('Password'), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByRole('heading', { name: 'Hello, Juan' })

    await userEvent.click(screen.getByRole('link', { name: /Profile of/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByLabelText('SR-code or Staff ID')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })

  it('asks the browser not to refill the form', () => {
    mockApi({})
    renderApp('/login', { loggedIn: false })
    expect(screen.getByLabelText('SR-code or Staff ID')).toHaveAttribute('autocomplete', 'off')
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password')
  })
})
