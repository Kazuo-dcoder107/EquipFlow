// End-to-end check: the real admin site talking to a REAL running backend (no faked API).
//
//   1. in backend/:  python -m scripts.seed_demo   (on an empty database)
//                    uvicorn app.main:app --port 8000
//   2. here:         EQUIPFLOW_E2E=1 npm test
//
// Skipped in a normal `npm test`, because it needs the backend and the demo data. Each test makes its
// own fresh people through the API, so the tests can be run again and again.
import { describe, expect, it } from 'vitest'
import { cleanup, configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './helpers'

configure({ asyncUtilTimeout: 4000 }) // the real server hashes passwords, which can take a moment

const API = 'http://localhost:8000'
const json = { 'Content-Type': 'application/json' }
let counter = 0
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`.toUpperCase()

async function adminToken() {
  const r = await fetch(`${API}/api/auth/admin/login`, { method: 'POST', body: new URLSearchParams({ username: 'admin', password: 'password123' }) })
  return (await r.json()).access_token
}
const adminGet = async (path) => (await fetch(API + path, { headers: { Authorization: `Bearer ${await adminToken()}` } })).json()

/** A teacher or staff member who has just signed up and is waiting for approval. */
async function newRequest(role = 'teacher') {
  const code = `E-${unique()}`
  const r = await fetch(`${API}/api/auth/register`, { method: 'POST', headers: json, body: JSON.stringify({
    sr_code: code, full_name: `Request ${code}`, email: `${code.toLowerCase()}@example.com`, password: 'password123', role }) })
  expect(r.status).toBe(201)
  return { ...(await r.json()), sr_code: code, full_name: `Request ${code}` }
}

/** A student who is registered, has all their details, and has linked an ID card at the demo kiosk. */
async function newStudentWithCard() {
  const code = `24-${unique()}`
  const depts = await (await fetch(`${API}/api/departments`)).json()
  const cics = depts.find((d) => d.name === 'CICS')
  const r = await fetch(`${API}/api/auth/register`, { method: 'POST', headers: json, body: JSON.stringify({
    sr_code: code, full_name: `Student ${code}`, email: `${code.toLowerCase()}@example.com`, password: 'password123',
    age: 19, department_id: cics.id, year_level: 2, program_id: cics.programs[0].id }) })
  expect(r.status).toBe(201)
  const linked = await fetch(`${API}/api/kiosk/enroll`, { method: 'POST', headers: { ...json, 'X-API-Key': 'demo-kiosk-key' }, body: JSON.stringify({ sr_code: code, user_uid: `AA${unique()}` }) })
  expect((await linked.json()).ok).toBe(true)
  return { sr_code: code, full_name: `Student ${code}` }
}

async function signIn(username = 'admin', password = 'password123') {
  renderApp('/login', { loggedIn: false })
  await userEvent.type(screen.getByLabelText('Username'), username)
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

const goTo = (name) => userEvent.click(screen.getByRole('link', { name: new RegExp(name) }))
const rowOf = (text) => screen.getByText(text, { selector: 'strong' }).closest('tr')

describe.skipIf(!process.env.EQUIPFLOW_E2E)('against the real backend', () => {
  it('the admin signs in and sees the dashboard with real numbers', async () => {
    await newRequest()
    await signIn()
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(await screen.findByText('Available')).toBeInTheDocument()
    const strip = await screen.findByRole('region', { name: 'Needs attention' })
    expect(strip).toHaveTextContent(/sign-up requests? (is|are) waiting for approval/)
    expect(screen.getByText('Overdue items')).toBeInTheDocument()
    expect(await screen.findByText('Databases')).toBeInTheDocument() // the demo's overdue book
  })

  it('a student account and a wrong password are both refused, with the same message', async () => {
    await signIn('24-0001')
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect username or password')
    expect(localStorage.getItem('equipflow-admin.token')).toBeNull()

    cleanup()
    await signIn('admin', 'wrong-password')
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect username or password')
  })

  it('approving a sign-up in the queue really approves it', async () => {
    const request = await newRequest('teacher')
    await signIn()
    await screen.findByRole('heading', { name: 'Dashboard' })
    await goTo('Approvals')
    const card = (await screen.findByText(request.full_name, { selector: 'h3' })).closest('article')
    expect(card).toHaveTextContent('Teacher')
    await userEvent.click(within(card).getByRole('button', { name: 'Approve' }))

    expect(await screen.findByRole('status')).toHaveTextContent(`Approved ${request.full_name}`)
    await waitFor(() => expect(screen.queryByText(request.full_name, { selector: 'h3' })).not.toBeInTheDocument())
    const stored = await adminGet(`/api/users?search=${request.sr_code}`)
    expect(stored.items[0].status).toBe('pending_enrollment')   // approved: now they can link their ID card
  })

  it('rejecting a sign-up with a reason really removes it', async () => {
    const request = await newRequest('staff')
    await signIn()
    await screen.findByRole('heading', { name: 'Dashboard' })
    await goTo('Approvals')
    const card = (await screen.findByText(request.full_name, { selector: 'h3' })).closest('article')
    await userEvent.click(within(card).getByRole('button', { name: 'Reject' }))
    await userEvent.type(await screen.findByLabelText(/Reason/), 'We could not verify your staff role')
    await userEvent.click(screen.getByRole('button', { name: 'Reject sign-up' }))

    expect(await screen.findByRole('status')).toHaveTextContent(`Rejected ${request.full_name}`)
    await waitFor(() => expect(screen.queryByText(request.full_name, { selector: 'h3' })).not.toBeInTheDocument())
    expect((await adminGet(`/api/users?search=${request.sr_code}`)).total).toBe(0)
  })

  it('the menu count follows the queue', async () => {
    await newRequest(); await newRequest()
    await signIn()
    const badge = await screen.findByLabelText(/\d+ waiting/)
    const before = Number(badge.textContent)
    expect(before).toBeGreaterThanOrEqual(2)

    await goTo('Approvals')
    const card = (await screen.findAllByRole('article'))[0]
    await userEvent.click(within(card).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(Number(screen.getByLabelText(/\d+ waiting/).textContent)).toBe(before - 1))
  })

  it('browses people by department, program, role and search', async () => {
    // Other tests keep adding people, so each check below looks for one known person by name
    // instead of relying on where they land in the full list.
    await signIn()
    await screen.findByRole('heading', { name: 'Dashboard' })
    await goTo('Users')
    const search = await screen.findByLabelText('Search')
    const departments = await screen.findByRole('group', { name: 'Department' })
    const gone = (name) => waitFor(() => expect(screen.queryByText(name, { selector: 'strong' })).not.toBeInTheDocument())

    await userEvent.type(search, 'Dela Cruz')                       // Juan: CICS, Information Technology, 3rd year
    expect(await screen.findByText('Juan Dela Cruz', { selector: 'strong' })).toBeInTheDocument()
    expect(rowOf('Juan Dela Cruz')).toHaveTextContent('3rd year')

    await userEvent.click(within(departments).getByRole('button', { name: /^COE/ }))
    await gone('Juan Dela Cruz')                                    // wrong department
    await userEvent.click(within(departments).getByRole('button', { name: /^CICS/ }))
    expect(await screen.findByText('Juan Dela Cruz', { selector: 'strong' })).toBeInTheDocument()

    const programs = await screen.findByRole('group', { name: 'Program' })
    await userEvent.click(within(programs).getByRole('button', { name: /Computer Science/ }))
    await gone('Juan Dela Cruz')                                    // right department, wrong program
    await userEvent.click(within(programs).getByRole('button', { name: /Information Technology/ }))
    expect(await screen.findByText('Juan Dela Cruz', { selector: 'strong' })).toBeInTheDocument()

    await userEvent.click(within(departments).getByRole('button', { name: 'All departments' }))
    await userEvent.clear(search)
    await userEvent.type(search, 'Tess')                            // Tess: the demo teacher
    expect(await screen.findByText('Tess Teacher', { selector: 'strong' })).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'Teacher')
    expect(await screen.findByText('Tess Teacher', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByLabelText('Year level')).toBeDisabled()
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'Student')
    await gone('Tess Teacher')                                      // Tess is not a student
    expect(screen.getByLabelText('Year level')).toBeEnabled()

    await userEvent.selectOptions(screen.getByLabelText('Role'), 'All roles')
    await userEvent.clear(search)
    await userEvent.type(search, 'Maria')
    await userEvent.click(within(departments).getByRole('button', { name: /^COE/ }))   // Maria studies Computer Engineering
    expect(await screen.findByText('Maria Santos', { selector: 'strong' })).toBeInTheDocument()
  })

  it('deactivates and then reissues a student\'s card, and the backend agrees each time', async () => {
    const student = await newStudentWithCard()
    await signIn()
    await screen.findByRole('heading', { name: 'Dashboard' })
    await goTo('Users')
    await userEvent.type(await screen.findByLabelText('Search'), student.sr_code)
    await waitFor(() => expect(within(rowOf(student.full_name)).getByText('Linked')).toBeInTheDocument())

    await userEvent.click(within(rowOf(student.full_name)).getByRole('button', { name: 'Deactivate card' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Deactivate card' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Deactivated')
    await waitFor(() => expect(within(rowOf(student.full_name)).getByText('Deactivated')).toBeInTheDocument())
    let stored = (await adminGet(`/api/users?search=${student.sr_code}`)).items[0]
    expect([stored.rfid_linked, stored.rfid_active]).toEqual([true, false])

    await userEvent.click(within(rowOf(student.full_name)).getByRole('button', { name: 'Reissue card' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reissue card' }))
    await waitFor(() => expect(within(rowOf(student.full_name)).getByText('Not linked')).toBeInTheDocument())
    stored = (await adminGet(`/api/users?search=${student.sr_code}`)).items[0]
    expect([stored.rfid_linked, stored.status]).toEqual([false, 'pending_enrollment'])   // they must link the new card at the kiosk
    expect(within(rowOf(student.full_name)).queryAllByRole('button')).toHaveLength(0)
  })

  it('shows the student details the backend holds (department, program, year)', async () => {
    const student = await newStudentWithCard()
    await signIn()
    await screen.findByRole('heading', { name: 'Dashboard' })
    await goTo('Users')
    await userEvent.type(await screen.findByLabelText('Search'), student.sr_code)
    await waitFor(() => expect(rowOf(student.full_name)).toHaveTextContent('2nd year'))
    expect(rowOf(student.full_name)).toHaveTextContent('CICS')
    expect(rowOf(student.full_name)).toHaveTextContent('Student')
    expect(rowOf(student.full_name)).toHaveTextContent('Active')
  })
})
