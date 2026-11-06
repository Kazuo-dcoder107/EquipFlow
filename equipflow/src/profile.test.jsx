import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEPARTMENTS, STUDENT, jsonResponse, mockApi, renderApp } from './test/helpers'

const TEACHER = { ...STUDENT, id: 2, role: 'teacher', full_name: 'Tess Teacher', age: null, department_id: null, department: null, year_level: null, program_id: null, program: null }
const BSIT = 'Bachelor of Science in Information Technology'
const optionNames = (select) => within(select).getAllByRole('option').map((o) => o.textContent)
const callsTo = (fetchMock, method, path) => fetchMock.mock.calls.filter(([url, o]) => (o?.method || 'GET') === method && new URL(url).pathname === path)
const body = (call) => JSON.parse(call[1].body)

describe('Register: the details students must give', () => {
  const api = (extra = {}) => mockApi({ 'GET /api/departments': DEPARTMENTS, ...extra })

  async function fillBasics(role = 'student') {
    await userEvent.selectOptions(screen.getByLabelText('I am a'), role)
    await userEvent.type(screen.getByLabelText('SR-code'), '24-7777')
    await userEvent.type(screen.getByLabelText('Full name'), 'Nina New')
    await userEvent.type(screen.getByLabelText('Email'), 'nina@example.com')
    await userEvent.type(screen.getByLabelText(/^Password/), 'password123')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'password123')
  }

  it('asks a student for age, department, year level and program, all marked as required', async () => {
    api()
    renderApp('/register', { loggedIn: false })
    for (const label of [/^Age/, /^Department/, /^Year level/, /^Program/]) {
      expect(await screen.findByLabelText(label)).toBeRequired()
    }
  })

  it('does not ask teachers or staff for any of them', async () => {
    api()
    renderApp('/register', { loggedIn: false })
    await screen.findByLabelText(/^Age/)
    for (const role of ['teacher', 'staff']) {
      await userEvent.selectOptions(screen.getByLabelText('I am a'), role)
      expect(screen.queryByLabelText(/^Age/)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/^Department/)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/^Year level/)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/^Program/)).not.toBeInTheDocument()
    }
  })

  it('offers students only departments that have programs', async () => {
    api()
    renderApp('/register', { loggedIn: false })
    const department = await screen.findByLabelText(/^Department/)
    expect(optionNames(department)).toEqual(['Choose department', 'CICS', 'CAFAD', 'COE'])
  })

  it('keeps the program list empty until a department is chosen, then shows only its programs', async () => {
    api()
    renderApp('/register', { loggedIn: false })
    const program = await screen.findByLabelText(/^Program/)
    expect(program).toBeDisabled()
    expect(optionNames(program)).toEqual(['Choose a department first'])

    await userEvent.selectOptions(screen.getByLabelText(/^Department/), 'CICS')
    expect(program).toBeEnabled()
    expect(optionNames(program)).toEqual(['Choose program', BSIT, 'Bachelor of Science in Computer Science'])

    await userEvent.selectOptions(program, BSIT)
    await userEvent.selectOptions(screen.getByLabelText(/^Department/), 'COE') // a program belongs to one department
    expect(program).toHaveValue('')
    expect(optionNames(program)).toEqual(['Choose program', 'Bachelor of Science in Civil Engineering'])
  })

  it('sends all four details to the API as numbers', async () => {
    const fetchMock = api({ 'POST /api/auth/register': () => jsonResponse({ id: 9, role: 'student', status: 'pending_enrollment' }, 201) })
    renderApp('/register', { loggedIn: false })
    await fillBasics()
    await userEvent.type(screen.getByLabelText(/^Age/), '19')
    await userEvent.selectOptions(screen.getByLabelText(/^Department/), 'COE')
    await userEvent.selectOptions(screen.getByLabelText(/^Year level/), '2nd year')
    await userEvent.selectOptions(screen.getByLabelText(/^Program/), 'Bachelor of Science in Civil Engineering')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('heading', { name: 'Account created' })).toBeInTheDocument()
    expect(body(callsTo(fetchMock, 'POST', '/api/auth/register')[0])).toMatchObject({
      role: 'student', age: 19, department_id: 4, year_level: 2, program_id: 4,
    })
  })

  it('sends no student details for a teacher', async () => {
    const fetchMock = api({ 'POST /api/auth/register': () => jsonResponse({ id: 9, role: 'teacher', status: 'pending_approval' }, 201) })
    renderApp('/register', { loggedIn: false })
    await fillBasics('teacher')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await screen.findByRole('heading', { name: 'Request sent' })
    const sent = body(callsTo(fetchMock, 'POST', '/api/auth/register')[0])
    expect(sent).not.toHaveProperty('age')
    expect(sent).not.toHaveProperty('year_level')
    expect(sent).not.toHaveProperty('program_id')
  })

  it('does not let a student submit with a detail missing', async () => {
    const fetchMock = api({ 'POST /api/auth/register': () => jsonResponse({}, 201) })
    renderApp('/register', { loggedIn: false })
    await fillBasics()
    await userEvent.type(screen.getByLabelText(/^Age/), '19')
    await userEvent.selectOptions(screen.getByLabelText(/^Department/), 'CICS')
    await userEvent.selectOptions(screen.getByLabelText(/^Year level/), '1st year') // program left empty
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(callsTo(fetchMock, 'POST', '/api/auth/register')).toHaveLength(0)
  })

  it('shows what the server says when it refuses the details', async () => {
    api({ 'POST /api/auth/register': () => jsonResponse({ detail: 'Unknown program.' }, 422) })
    renderApp('/register', { loggedIn: false })
    await fillBasics()
    await userEvent.type(screen.getByLabelText(/^Age/), '19')
    await userEvent.selectOptions(screen.getByLabelText(/^Department/), 'CICS')
    await userEvent.selectOptions(screen.getByLabelText(/^Year level/), '1st year')
    await userEvent.selectOptions(screen.getByLabelText(/^Program/), BSIT)
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Unknown program.')
  })

  it('stops an age outside 15 to 99 in the browser, before it reaches the server', async () => {
    const fetchMock = api({ 'POST /api/auth/register': () => jsonResponse({}, 201) })
    renderApp('/register', { loggedIn: false })
    await fillBasics()
    await userEvent.type(screen.getByLabelText(/^Age/), '12')
    await userEvent.selectOptions(screen.getByLabelText(/^Department/), 'CICS')
    await userEvent.selectOptions(screen.getByLabelText(/^Year level/), '1st year')
    await userEvent.selectOptions(screen.getByLabelText(/^Program/), BSIT)
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(callsTo(fetchMock, 'POST', '/api/auth/register')).toHaveLength(0)
    expect(screen.getByLabelText(/^Age/)).toBeInvalid()
  })

  it('explains it when no programs exist yet, and blocks student sign-up', async () => {
    mockApi({ 'GET /api/departments': DEPARTMENTS.map((d) => ({ ...d, programs: [] })) })
    renderApp('/register', { loggedIn: false })
    expect(await screen.findByText(/Student sign-up is not open yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled()

    await userEvent.selectOptions(screen.getByLabelText('I am a'), 'teacher') // teachers are not affected
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled()
  })

  it('offers a retry when the departments cannot be loaded', async () => {
    let calls = 0
    mockApi({ 'GET /api/departments': () => (++calls === 1 ? jsonResponse({ detail: 'Server error' }, 500) : jsonResponse(DEPARTMENTS)) })
    renderApp('/register', { loggedIn: false })
    expect(await screen.findByRole('alert')).toHaveTextContent('Server error')
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByLabelText(/^Age/)).toBeInTheDocument()
  })
})

describe('Profile: the About you card', () => {
  function profileApi(user, { put } = {}) {
    let current = user
    return mockApi({
      'GET /api/auth/me': () => jsonResponse(current),
      'GET /api/departments': DEPARTMENTS,
      'PUT /api/me/profile': put || ((url, options) => {
        const sent = JSON.parse(options.body)
        const department = DEPARTMENTS.find((d) => d.id === sent.department_id)
        current = { ...current, ...sent, department: department?.name ?? null, profile_complete: true }
        return jsonResponse(current)
      }),
    })
  }

  it('shows a student their saved details, with every field required', async () => {
    profileApi(STUDENT)
    renderApp('/profile')
    expect(await screen.findByLabelText(/^Age/)).toHaveValue(20)
    expect(screen.getByLabelText(/^Department/)).toHaveDisplayValue('CICS')
    expect(screen.getByLabelText(/^Year level/)).toHaveDisplayValue('3rd year')
    expect(screen.getByLabelText(/^Program/)).toHaveDisplayValue(BSIT)
    // the full program name is also written out, because the closed dropdown can cut it off on a phone
    expect(screen.getByText(BSIT, { selector: '.selected-full' })).toBeInTheDocument()
    for (const label of [/^Age/, /^Department/, /^Year level/, /^Program/]) expect(screen.getByLabelText(label)).toBeRequired()
    expect(screen.getByText(/Fields marked \* are required/)).toBeInTheDocument()
  })

  it('saves a change and confirms it', async () => {
    const fetchMock = profileApi(STUDENT)
    renderApp('/profile')
    await userEvent.selectOptions(await screen.findByLabelText(/^Year level/), '4th year')
    await userEvent.clear(screen.getByLabelText(/^Age/))
    await userEvent.type(screen.getByLabelText(/^Age/), '21')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Saved')
    expect(body(callsTo(fetchMock, 'PUT', '/api/me/profile')[0])).toEqual({ age: 21, department_id: 1, year_level: 4, program_id: 1 })
  })

  it('takes "Saved" away as soon as the form is edited again', async () => {
    profileApi(STUDENT)
    renderApp('/profile')
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Saved')
    await userEvent.selectOptions(screen.getByLabelText(/^Year level/), '2nd year')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('clears the program when the department changes, so a mismatch cannot be saved', async () => {
    const fetchMock = profileApi(STUDENT)
    renderApp('/profile')
    await userEvent.selectOptions(await screen.findByLabelText(/^Department/), 'COE')
    expect(screen.getByLabelText(/^Program/)).toHaveValue('')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(callsTo(fetchMock, 'PUT', '/api/me/profile')).toHaveLength(0) // program is required, so the browser stops it
    await userEvent.selectOptions(screen.getByLabelText(/^Program/), 'Bachelor of Science in Civil Engineering')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(body(callsTo(fetchMock, 'PUT', '/api/me/profile')[0])).toMatchObject({ department_id: 4, program_id: 4 }))
  })

  it('gives a teacher only age and department, both optional, with every department available', async () => {
    const fetchMock = profileApi(TEACHER)
    renderApp('/profile')
    const department = await screen.findByLabelText(/^Department/)
    expect(optionNames(department)).toEqual(['Choose department', 'CICS', 'CAFAD', 'CET', 'COE', 'General Service'])
    expect(department).not.toBeRequired()
    expect(screen.getByLabelText(/^Age/)).not.toBeRequired()
    expect(screen.queryByLabelText(/^Year level/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Program/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Fields marked \*/)).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/^Age/), '41')
    await userEvent.selectOptions(department, 'General Service')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Saved')
    expect(body(callsTo(fetchMock, 'PUT', '/api/me/profile')[0])).toEqual({ age: 41, department_id: 5, year_level: null, program_id: null })
  })

  it('lets staff save with everything left empty', async () => {
    const fetchMock = profileApi({ ...TEACHER, role: 'staff' })
    renderApp('/profile')
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Saved')
    expect(body(callsTo(fetchMock, 'PUT', '/api/me/profile')[0])).toEqual({ age: null, department_id: null, year_level: null, program_id: null })
  })

  it('shows what the server says when it refuses the details', async () => {
    profileApi(STUDENT, { put: () => jsonResponse({ detail: 'That program does not belong to the selected department.' }, 422) })
    renderApp('/profile')
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('does not belong')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('"Complete your profile" notice', () => {
  const home = (me) => ({
    'GET /api/auth/me': me,
    'GET /api/departments': DEPARTMENTS,
    'GET /api/me/summary': { borrowed_now: 0, overdue_now: 0, unpaid_total: 0 },
    'GET /api/me/transactions': { total: 0, items: [] },
    'GET /api/me/recommendations': { strategy: 'popular', borrowing_blocked: null, top_categories: [], top_genres: [], items: [] },
  })
  const incomplete = { ...STUDENT, age: null, department_id: null, department: null, year_level: null, program_id: null, program: null, profile_complete: false }

  it('nudges a student who has not filled in their details, with a link to the profile', async () => {
    mockApi(home(incomplete))
    renderApp('/')
    expect(await screen.findByText('Complete your profile')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to profile' })).toHaveAttribute('href', '/profile')
  })

  it('does not show it to a student whose profile is complete, or to a teacher', async () => {
    mockApi(home(STUDENT))
    renderApp('/')
    await screen.findByRole('heading', { name: 'Hello, Juan' })
    expect(screen.queryByText('Complete your profile')).not.toBeInTheDocument()
  })

  it('shows on the profile page without a pointless link to itself', async () => {
    mockApi(home(incomplete))
    renderApp('/profile')
    expect(await screen.findByText('Complete your profile')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Go to profile' })).not.toBeInTheDocument()
  })

  it('appears next to the ID card notice when both apply', async () => {
    mockApi(home({ ...incomplete, status: 'pending_enrollment', rfid_linked: false }))
    renderApp('/')
    expect(await screen.findByText('Complete your profile')).toBeInTheDocument()
    expect(screen.getByText('One more step')).toBeInTheDocument()
  })

  it('goes away once the student saves their details', async () => {
    let me = incomplete
    mockApi({
      ...home(incomplete),
      'GET /api/auth/me': () => jsonResponse(me),
      'PUT /api/me/profile': () => { me = STUDENT; return jsonResponse(me) },
    })
    renderApp('/profile')
    await userEvent.type(await screen.findByLabelText(/^Age/), '20')
    await userEvent.selectOptions(screen.getByLabelText(/^Department/), 'CICS')
    await userEvent.selectOptions(screen.getByLabelText(/^Year level/), '3rd year')
    await userEvent.selectOptions(screen.getByLabelText(/^Program/), BSIT)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByText('Complete your profile')).not.toBeInTheDocument())
  })
})
