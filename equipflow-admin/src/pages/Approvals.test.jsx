import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ADMIN, jsonResponse, mockApi, person, renderApp, usersPage } from '../test/helpers'

const TESS = person({ id: 11, full_name: 'Tess Teacher', sr_code: 'T-001', email: 'tess@example.com', role: 'teacher', status: 'pending_approval', department: 'CICS', age: 41, program: null, year_level: null, rfid_linked: false })
const STAN = person({ id: 12, full_name: 'Stan Staff', sr_code: 'F-001', email: 'stan@example.com', role: 'staff', status: 'pending_approval', department: null, age: null, program: null, year_level: null, rfid_linked: false })

const asks = (fetchMock, method, path) => fetchMock.mock.calls.filter(([url, o]) => (o?.method || 'GET') === method && new URL(url).pathname === path)
const queryOf = (call) => Object.fromEntries(new URL(call[0]).searchParams)

/** An API whose waiting list shrinks as requests are decided, like the real one. */
function queueApi({ requests = [TESS, STAN], reject, approve } = {}) {
  let waiting = [...requests]
  return mockApi({
    'GET /api/auth/me': ADMIN,
    'GET /api/users': (url) => {
      const q = new URL(url).searchParams
      if (q.get('status') !== 'pending_approval') return jsonResponse(usersPage([]))
      return jsonResponse(usersPage(q.get('limit') === '1' ? waiting.slice(0, 1) : waiting, waiting.length))
    },
    'POST /api/users/11/approve': approve || (() => { waiting = waiting.filter((p) => p.id !== 11); return jsonResponse({ ...TESS, status: 'pending_enrollment' }) }),
    'POST /api/users/12/reject': reject || (() => { waiting = waiting.filter((p) => p.id !== 12); return jsonResponse({ ok: true, emailed: true }) }),
    'POST /api/users/11/reject': reject || (() => { waiting = waiting.filter((p) => p.id !== 11); return jsonResponse({ ok: true, emailed: false }) }),
  })
}

describe('Approvals queue', () => {
  it('lists each waiting sign-up with who they are, their requested role, and when', async () => {
    const fetchMock = queueApi()
    renderApp('/approvals')
    const cards = await screen.findAllByRole('article')
    expect(cards).toHaveLength(2)

    expect(cards[0]).toHaveTextContent('Tess Teacher')
    expect(cards[0]).toHaveTextContent('Teacher')
    expect(cards[0]).toHaveTextContent('T-001')
    expect(cards[0]).toHaveTextContent('tess@example.com')
    expect(cards[0]).toHaveTextContent('Signed up')
    expect(cards[0]).toHaveTextContent('CICS')
    expect(cards[0]).toHaveTextContent('age 41')
    expect(cards[1]).toHaveTextContent('Stan Staff')
    expect(cards[1]).toHaveTextContent('Staff')
    expect(cards[1]).not.toHaveTextContent('age')

    const list = asks(fetchMock, 'GET', '/api/users').map(queryOf).find((q) => q.limit === '100')
    expect(list.status).toBe('pending_approval')   // only the requests that are waiting
  })

  it('shows how many are waiting in the side menu', async () => {
    queueApi()
    renderApp('/approvals')
    expect(await screen.findByLabelText('2 waiting')).toBeInTheDocument()
  })

  it('approves a request, says so, and removes it from the queue and the menu count', async () => {
    const fetchMock = queueApi()
    renderApp('/approvals')
    const card = (await screen.findByText('Tess Teacher')).closest('article')
    await userEvent.click(within(card).getByRole('button', { name: 'Approve' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Approved Tess Teacher. They can now link their ID card at the kiosk.')
    await waitFor(() => expect(screen.queryByText('Tess Teacher', { selector: 'h3' })).not.toBeInTheDocument())
    expect(asks(fetchMock, 'POST', '/api/users/11/approve')).toHaveLength(1)
    expect(await screen.findByLabelText('1 waiting')).toBeInTheDocument()
  })

  it('shows the error when approving fails, and keeps the request', async () => {
    queueApi({ approve: () => jsonResponse({ detail: 'User is not waiting for approval' }, 409) })
    renderApp('/approvals')
    const card = (await screen.findByText('Tess Teacher')).closest('article')
    await userEvent.click(within(card).getByRole('button', { name: 'Approve' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('User is not waiting for approval')
    expect(screen.getByText('Tess Teacher', { selector: 'h3' })).toBeInTheDocument()
  })

  it('asks before rejecting, sends the reason (trimmed), and says whether an email went out', async () => {
    const fetchMock = queueApi()
    renderApp('/approvals')
    const card = (await screen.findByText('Stan Staff')).closest('article')
    await userEvent.click(within(card).getByRole('button', { name: 'Reject' }))

    const dialog = await screen.findByRole('dialog', { name: 'Reject Stan Staff?' })
    expect(asks(fetchMock, 'POST', '/api/users/12/reject')).toHaveLength(0) // nothing happens until confirmed
    expect(within(dialog).getByLabelText(/Reason/)).toHaveFocus()
    await userEvent.type(within(dialog).getByLabelText(/Reason/), '  Could not verify you  ')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reject sign-up' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Rejected Stan Staff and sent them an email.')
    expect(JSON.parse(asks(fetchMock, 'POST', '/api/users/12/reject')[0][1].body)).toEqual({ reason: 'Could not verify you' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Stan Staff', { selector: 'h3' })).not.toBeInTheDocument())
  })

  it('rejects without a reason, and says when no email was sent', async () => {
    const fetchMock = queueApi()
    renderApp('/approvals')
    const card = (await screen.findByText('Tess Teacher')).closest('article')
    await userEvent.click(within(card).getByRole('button', { name: 'Reject' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Reject sign-up' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Rejected Tess Teacher (no email was sent).')
    expect(JSON.parse(asks(fetchMock, 'POST', '/api/users/11/reject')[0][1].body)).toEqual({})
  })

  it('cancels a rejection with the button, with Escape, or by clicking outside', async () => {
    const fetchMock = queueApi()
    renderApp('/approvals')
    const open = async () => {
      const card = (await screen.findByText('Tess Teacher')).closest('article')
      await userEvent.click(within(card).getByRole('button', { name: 'Reject' }))
      return screen.findByRole('dialog')
    }

    await open(); await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await open(); await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await open(); await userEvent.click(document.querySelector('.modal-backdrop'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    expect(asks(fetchMock, 'POST', '/api/users/11/reject')).toHaveLength(0)
    expect(screen.getByText('Tess Teacher', { selector: 'h3' })).toBeInTheDocument()
  })

  it('starts the next rejection with an empty reason', async () => {
    queueApi()
    renderApp('/approvals')
    const card = (await screen.findByText('Tess Teacher')).closest('article')
    await userEvent.click(within(card).getByRole('button', { name: 'Reject' }))
    await userEvent.type(await screen.findByLabelText(/Reason/), 'half typed')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(within(card).getByRole('button', { name: 'Reject' }))
    expect(await screen.findByLabelText(/Reason/)).toHaveValue('')
  })

  it('keeps the dialog open and shows the error when rejecting fails', async () => {
    queueApi({ reject: () => jsonResponse({ detail: 'User is not waiting for approval' }, 409) })
    renderApp('/approvals')
    const card = (await screen.findByText('Tess Teacher')).closest('article')
    await userEvent.click(within(card).getByRole('button', { name: 'Reject' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Reject sign-up' }))

    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('User is not waiting for approval')
    expect(within(dialog).getByRole('button', { name: 'Reject sign-up' })).toBeEnabled()
  })

  it('limits the reason to 300 characters and counts them', async () => {
    queueApi()
    renderApp('/approvals')
    const card = (await screen.findByText('Tess Teacher')).closest('article')
    await userEvent.click(within(card).getByRole('button', { name: 'Reject' }))
    const box = await screen.findByLabelText(/Reason/)
    expect(box).toHaveAttribute('maxlength', '300')
    await userEvent.type(box, 'hello')
    expect(screen.getByText('5/300')).toBeInTheDocument()
  })

  it('has an empty state, and the menu shows no number', async () => {
    queueApi({ requests: [] })
    renderApp('/approvals')
    expect(await screen.findByText('No requests are waiting')).toBeInTheDocument()
    expect(screen.queryByLabelText(/waiting$/)).not.toBeInTheDocument()
  })

  it('offers a retry when the queue cannot be loaded', async () => {
    let calls = 0
    mockApi({
      'GET /api/auth/me': ADMIN,
      'GET /api/users': (url) => (new URL(url).searchParams.get('limit') === '1' ? jsonResponse(usersPage([])) : (++calls === 1 ? jsonResponse({ detail: 'Server error' }, 500) : jsonResponse(usersPage([TESS])))),
    })
    renderApp('/approvals')
    expect(await screen.findByRole('alert')).toHaveTextContent('Server error')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Tess Teacher')).toBeInTheDocument()
  })
})
