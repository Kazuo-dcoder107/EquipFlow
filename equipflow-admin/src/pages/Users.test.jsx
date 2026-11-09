import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, OVERVIEW, jsonResponse, mockApi, person, renderApp, usersPage } from '../test/helpers'

const JUAN = person({ id: 21, full_name: 'Juan Dela Cruz', sr_code: '24-0001', email: 'juan@example.com', year_level: 3 })
const LOST = person({ id: 22, full_name: 'Lia Lost', sr_code: '24-0002', email: 'lia@example.com', rfid_active: false, department: 'COE', program: 'Bachelor of Science in Civil Engineering', year_level: 1 })
const NOCARD = person({ id: 23, full_name: 'Nico NoCard', sr_code: '24-0003', email: 'nico@example.com', rfid_linked: false, status: 'pending_enrollment' })
const TESS = person({ id: 24, full_name: 'Tess Teacher', sr_code: 'T-001', email: 'tess@example.com', role: 'teacher', department: 'CICS', program: null, year_level: null })
const WAITING = person({ id: 25, full_name: 'Tomas Torres', sr_code: 'T-002', email: 't2@example.com', role: 'teacher', status: 'pending_approval', rfid_linked: false, department: null, program: null, year_level: null })
const BOSS = person({ id: 1, full_name: 'Demo Admin', sr_code: 'admin', email: 'admin@example.com', role: 'admin', rfid_linked: false, department: null, program: null, year_level: null })

const asks = (fetchMock, method, path) => fetchMock.mock.calls.filter(([url, o]) => (o?.method || 'GET') === method && new URL(url).pathname === path)
const lastList = (fetchMock) => Object.fromEntries(new URL(asks(fetchMock, 'GET', '/api/users').filter(([u]) => new URL(u).searchParams.get('limit') === '25').at(-1)[0]).searchParams)
const rowOf = (name) => screen.getByText(name, { selector: 'strong' }).closest('tr')

function usersApi(items = [JUAN, LOST, NOCARD, TESS, WAITING, BOSS], { total, extra = {} } = {}) {
  return mockApi({
    'GET /api/auth/me': ADMIN,
    'GET /api/departments/overview': OVERVIEW,
    'GET /api/users': (url) => (new URL(url).searchParams.get('limit') === '1' ? jsonResponse(usersPage([], 0)) : jsonResponse(usersPage(items, total ?? items.length))),
    ...extra,
  })
}

describe('Users list', () => {
  it('shows each person with role, status, department, program and year, and card status', async () => {
    usersApi()
    renderApp('/users')
    await screen.findByText('Juan Dela Cruz')

    const juan = rowOf('Juan Dela Cruz')
    expect(juan).toHaveTextContent('24-0001')
    expect(juan).toHaveTextContent('juan@example.com')
    expect(juan).toHaveTextContent('Student')
    expect(juan).toHaveTextContent('Active')
    expect(juan).toHaveTextContent('CICS')
    expect(juan).toHaveTextContent('Bachelor of Science in Information Technology, 3rd year')
    expect(juan).toHaveTextContent('Linked')
    expect(rowOf('Lia Lost')).toHaveTextContent('Deactivated')
    expect(rowOf('Nico NoCard')).toHaveTextContent('Waiting for ID card')
    expect(rowOf('Nico NoCard')).toHaveTextContent('Not linked')
    expect(rowOf('Tomas Torres')).toHaveTextContent('Waiting for approval')
    expect(rowOf('Tess Teacher')).toHaveTextContent('CICS') // teachers show a department but no program or year
    expect(rowOf('Tess Teacher')).not.toHaveTextContent('year')
  })

  it('offers the card actions that make sense for each person', async () => {
    usersApi()
    renderApp('/users')
    await screen.findByText('Juan Dela Cruz')
    const buttons = (name) => within(rowOf(name)).queryAllByRole('button').map((b) => b.textContent)

    expect(buttons('Juan Dela Cruz')).toEqual(['Deactivate card', 'Reissue card'])  // linked and working
    expect(buttons('Lia Lost')).toEqual(['Reissue card'])                           // already deactivated
    expect(buttons('Nico NoCard')).toEqual([])                                      // no card yet
    expect(buttons('Demo Admin')).toEqual([])                                       // admins have no card
    expect(within(rowOf('Tomas Torres')).getByRole('link', { name: 'Review' })).toHaveAttribute('href', '/approvals')
  })

  it('has an empty state and says nothing when there is nobody', async () => {
    usersApi([])
    renderApp('/users')
    expect(await screen.findByText('No users found')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('offers a retry when the list cannot be loaded', async () => {
    let calls = 0
    mockApi({
      'GET /api/auth/me': ADMIN, 'GET /api/departments/overview': OVERVIEW,
      'GET /api/users': (url) => (new URL(url).searchParams.get('limit') === '1' ? jsonResponse(usersPage([])) : (++calls === 1 ? jsonResponse({ detail: 'Server error' }, 500) : jsonResponse(usersPage([JUAN])))),
    })
    renderApp('/users')
    expect(await screen.findByRole('alert')).toHaveTextContent('Server error')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Juan Dela Cruz')).toBeInTheDocument()
  })
})

describe('Users filters', () => {
  it('sends the search once typing pauses, and the role, status and year filters', async () => {
    const fetchMock = usersApi()
    renderApp('/users')
    await screen.findByText('Juan Dela Cruz')

    await userEvent.type(screen.getByLabelText('Search'), 'juan')
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'Student')
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'Waiting for ID card')
    await userEvent.selectOptions(screen.getByLabelText('Year level'), '3rd year')

    await waitFor(() => expect(lastList(fetchMock)).toMatchObject({ search: 'juan', role: 'student', status: 'pending_enrollment', year_level: '3', limit: '25', offset: '0' }))
    const searches = asks(fetchMock, 'GET', '/api/users').map(([u]) => new URL(u).searchParams.get('search')).filter(Boolean)
    expect(new Set(searches)).toEqual(new Set(['juan'])) // typing "juan" did not cause one request per letter
  })

  it('switches the year filter off for teachers, staff and admins, and forgets it', async () => {
    const fetchMock = usersApi()
    renderApp('/users')
    await screen.findByText('Juan Dela Cruz')
    await userEvent.selectOptions(screen.getByLabelText('Year level'), '2nd year')
    await waitFor(() => expect(lastList(fetchMock)).toMatchObject({ year_level: '2' }))

    await userEvent.selectOptions(screen.getByLabelText('Role'), 'Teacher')
    expect(screen.getByLabelText('Year level')).toBeDisabled()
    expect(within(screen.getByLabelText('Year level')).getByRole('option', { name: 'Students only' })).toBeInTheDocument()
    await waitFor(() => expect(lastList(fetchMock)).toMatchObject({ role: 'teacher' }))
    expect(lastList(fetchMock)).not.toHaveProperty('year_level')

    await userEvent.selectOptions(screen.getByLabelText('Role'), 'All roles')
    expect(screen.getByLabelText('Year level')).toBeEnabled()
    expect(screen.getByLabelText('Year level')).toHaveValue('')
  })

  it('shows department chips with counts, and the programs of the chosen department', async () => {
    const fetchMock = usersApi()
    renderApp('/users')
    const departments = await screen.findByRole('group', { name: 'Department' })
    expect(within(departments).getAllByRole('button').map((b) => b.textContent.trim())).toEqual(
      ['All departments', 'CICS 12', 'CAFAD 4', 'CET 0', 'COE 6', 'General Service 2'])
    expect(screen.queryByRole('group', { name: 'Program' })).not.toBeInTheDocument()

    await userEvent.click(within(departments).getByRole('button', { name: /^CICS/ }))
    const programs = await screen.findByRole('group', { name: 'Program' })
    expect(within(programs).getAllByRole('button').map((b) => b.textContent.trim())).toEqual([
      'All programs', 'Bachelor of Science in Information Technology 7', 'Bachelor of Science in Computer Science 3'])
    await waitFor(() => expect(lastList(fetchMock)).toMatchObject({ department_id: '1' }))

    await userEvent.click(within(programs).getByRole('button', { name: /Computer Science/ }))
    await waitFor(() => expect(lastList(fetchMock)).toMatchObject({ department_id: '1', program_id: '2' }))
    expect(within(programs).getByRole('button', { name: /Computer Science/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('forgets the program when another department is chosen, and when going back to all', async () => {
    const fetchMock = usersApi()
    renderApp('/users')
    const departments = await screen.findByRole('group', { name: 'Department' })
    await userEvent.click(within(departments).getByRole('button', { name: /^CICS/ }))
    await userEvent.click(within(await screen.findByRole('group', { name: 'Program' })).getByRole('button', { name: /Computer Science/ }))
    await waitFor(() => expect(lastList(fetchMock)).toMatchObject({ program_id: '2' }))

    await userEvent.click(within(departments).getByRole('button', { name: /^COE/ }))
    await waitFor(() => expect(lastList(fetchMock)).toMatchObject({ department_id: '4' }))
    expect(lastList(fetchMock)).not.toHaveProperty('program_id')   // a CICS program cannot apply to COE

    await userEvent.click(within(departments).getByRole('button', { name: 'All departments' }))
    await waitFor(() => expect(lastList(fetchMock)).not.toHaveProperty('department_id'))
    expect(screen.queryByRole('group', { name: 'Program' })).not.toBeInTheDocument()
  })

  it('shows no program chips for a department without programs', async () => {
    usersApi()
    renderApp('/users')
    const departments = await screen.findByRole('group', { name: 'Department' })
    await userEvent.click(within(departments).getByRole('button', { name: /^General Service/ }))
    expect(screen.queryByRole('group', { name: 'Program' })).not.toBeInTheDocument()
  })

  it('still works when the department overview cannot be loaded', async () => {
    mockApi({
      'GET /api/auth/me': ADMIN, 'GET /api/departments/overview': () => jsonResponse({ detail: 'Overview unavailable' }, 500),
      'GET /api/users': (url) => jsonResponse(usersPage(new URL(url).searchParams.get('limit') === '1' ? [] : [JUAN])),
    })
    renderApp('/users')
    expect(await screen.findByText('Juan Dela Cruz')).toBeInTheDocument()
    expect(await screen.findByText('Overview unavailable')).toBeInTheDocument()
  })
})

describe('Users paging', () => {
  const many = Array.from({ length: 25 }, (_, i) => person({ id: 300 + i, full_name: `Person ${i}` }))

  it('moves between pages 25 at a time and says where you are', async () => {
    const fetchMock = usersApi(many, { total: 53 })
    renderApp('/users')
    await screen.findByText('Person 0')
    const pager = screen.getByRole('navigation', { name: 'Pages' })
    expect(pager).toHaveTextContent('Showing 1\u201325 of 53')
    expect(within(pager).getByRole('button', { name: 'Previous' })).toBeDisabled()

    await userEvent.click(within(pager).getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(lastList(fetchMock)).toMatchObject({ offset: '25' }))
    expect(pager).toHaveTextContent('Showing 26\u201350 of 53')
    await userEvent.click(within(pager).getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(pager).toHaveTextContent('Showing 51\u201353 of 53'))
    expect(within(pager).getByRole('button', { name: 'Next' })).toBeDisabled()
    await userEvent.click(within(pager).getByRole('button', { name: 'Previous' }))
    await waitFor(() => expect(lastList(fetchMock)).toMatchObject({ offset: '25' }))
  })

  it('goes back to the first page when a filter changes', async () => {
    const fetchMock = usersApi(many, { total: 53 })
    renderApp('/users')
    await screen.findByText('Person 0')
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(lastList(fetchMock)).toMatchObject({ offset: '25' }))

    await userEvent.selectOptions(screen.getByLabelText('Role'), 'Student')
    await waitFor(() => expect(lastList(fetchMock)).toMatchObject({ role: 'student', offset: '0' }))
  })

  it('shows no pager for a short list', async () => {
    usersApi([JUAN])
    renderApp('/users')
    await screen.findByText('Juan Dela Cruz')
    expect(screen.queryByRole('navigation', { name: 'Pages' })).not.toBeInTheDocument()
  })
})

describe('Lost ID cards', () => {
  const api = (extra = {}) => usersApi([JUAN, LOST], { extra })

  it('explains the effect and only deactivates after confirming', async () => {
    const fetchMock = api({ 'POST /api/users/21/deactivate-tag': { ...JUAN, rfid_active: false } })
    renderApp('/users')
    await screen.findByText('Juan Dela Cruz')
    await userEvent.click(within(rowOf('Juan Dela Cruz')).getByRole('button', { name: 'Deactivate card' }))

    const dialog = await screen.findByRole('dialog', { name: "Deactivate Juan Dela Cruz's card?" })
    expect(dialog).toHaveTextContent('stops working at once')
    expect(dialog).toHaveTextContent('keeps their account and borrowing history')
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus() // the safe choice is the default
    expect(asks(fetchMock, 'POST', '/api/users/21/deactivate-tag')).toHaveLength(0)

    await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate card' }))
    expect(await screen.findByRole('status')).toHaveTextContent("Deactivated Juan Dela Cruz's card.")
    expect(asks(fetchMock, 'POST', '/api/users/21/deactivate-tag')).toHaveLength(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('reissues a card, explaining that the person must link the new one at the kiosk', async () => {
    const fetchMock = api({ 'POST /api/users/22/reissue-tag': { ...LOST, rfid_linked: false } })
    renderApp('/users')
    await screen.findByText('Lia Lost')
    await userEvent.click(within(rowOf('Lia Lost')).getByRole('button', { name: 'Reissue card' }))

    const dialog = await screen.findByRole('dialog', { name: "Reissue Lia Lost's card?" })
    expect(dialog).toHaveTextContent('must tap the new card at the kiosk')
    expect(dialog).toHaveTextContent('borrowing history and open loans are kept')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reissue card' }))
    expect(await screen.findByRole('status')).toHaveTextContent("Lia Lost's card was unlinked.")
    expect(asks(fetchMock, 'POST', '/api/users/22/reissue-tag')).toHaveLength(1)
  })

  it('reloads the list after an action', async () => {
    const fetchMock = api({ 'POST /api/users/21/deactivate-tag': { ...JUAN } })
    renderApp('/users')
    await screen.findByText('Juan Dela Cruz')
    const before = asks(fetchMock, 'GET', '/api/users').filter(([u]) => new URL(u).searchParams.get('limit') === '25').length
    await userEvent.click(within(rowOf('Juan Dela Cruz')).getByRole('button', { name: 'Deactivate card' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Deactivate card' }))
    await waitFor(() => expect(asks(fetchMock, 'GET', '/api/users').filter(([u]) => new URL(u).searchParams.get('limit') === '25').length).toBe(before + 1))
  })

  it('does nothing when cancelled', async () => {
    const fetchMock = api()
    renderApp('/users')
    await screen.findByText('Juan Dela Cruz')
    await userEvent.click(within(rowOf('Juan Dela Cruz')).getByRole('button', { name: 'Deactivate card' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(asks(fetchMock, 'POST', '/api/users/21/deactivate-tag')).toHaveLength(0)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps the dialog open and shows the error when it fails', async () => {
    api({ 'POST /api/users/21/deactivate-tag': () => jsonResponse({ detail: 'User has no ID tag linked' }, 409) })
    renderApp('/users')
    await screen.findByText('Juan Dela Cruz')
    await userEvent.click(within(rowOf('Juan Dela Cruz')).getByRole('button', { name: 'Deactivate card' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate card' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('User has no ID tag linked')
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })
})
