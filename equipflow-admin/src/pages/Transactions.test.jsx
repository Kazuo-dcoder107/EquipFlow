import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { baseRoutes, jsonResponse, mockApi, renderApp } from '../test/helpers'

const loan = (overrides = {}) => ({
  id: 7, equipment_id: 3, equipment_name: 'Laptop 02', category: 'Laptop', type: 'hardware', user_id: 5, sr_code: '24-0001',
  full_name: 'Juan Dela Cruz', borrowed_at: '2026-03-01T08:00:00Z', due_at: '2026-03-04T08:00:00Z', returned_at: null,
  state: 'overdue', fine: 100, agreement_accepted_at: null, condition_on_return: null, ...overrides,
})
const fine = (overrides = {}) => ({
  id: 4, transaction_id: 7, user_id: 5, sr_code: '24-0001', full_name: 'Juan Dela Cruz', equipment_name: 'Laptop 02',
  type: 'overdue_fine', amount: 100, status: 'unpaid', notes: null, created_at: '2026-03-05T00:00:00Z', resolved_at: null, ...overrides,
})

const asks = (fetchMock, method, path) => fetchMock.mock.calls.filter(([url, o]) => (o?.method || 'GET') === method && new URL(url).pathname === path)
const bodyOf = (call) => JSON.parse(call[1].body)
const lastQuery = (fetchMock, path) => Object.fromEntries(new URL(asks(fetchMock, 'GET', path).at(-1)[0]).searchParams)

describe('Loans', () => {
  const loansApi = (loans, extra = {}) => mockApi({ ...baseRoutes(), 'GET /api/transactions': { total: loans.length, items: loans }, ...extra })

  it('lists each loan with the item, borrower, due date, state and fine so far', async () => {
    loansApi([loan(), loan({ id: 8, equipment_name: 'Clean Code', full_name: 'Maria Santos', sr_code: '24-0002', state: 'returned', returned_at: '2026-03-03T09:00:00Z', fine: 0 })])
    renderApp('/transactions')
    const row = (await screen.findByText('Laptop 02', { selector: 'strong' })).closest('tr')
    expect(row).toHaveTextContent('Juan Dela Cruz')
    expect(row).toHaveTextContent('24-0001')
    expect(row).toHaveTextContent('Overdue')
    expect(row).toHaveTextContent('100')
    const returned = screen.getByText('Clean Code', { selector: 'strong' }).closest('tr')
    expect(returned).toHaveTextContent('Returned')
    expect(returned).toHaveTextContent('returned')
  })

  it('sends the search, state and date filters', async () => {
    const fetchMock = loansApi([loan()])
    renderApp('/transactions')
    await screen.findByText('Laptop 02')
    await userEvent.type(screen.getByLabelText('Search'), 'juan')
    await userEvent.selectOptions(screen.getByLabelText('State'), 'overdue')
    fireEvent.change(screen.getByLabelText('Borrowed from'), { target: { value: '2026-03-01' } })
    fireEvent.change(screen.getByLabelText('Borrowed until'), { target: { value: '2026-03-31' } })
    await waitFor(() => expect(lastQuery(fetchMock, '/api/transactions')).toMatchObject({
      search: 'juan', state: 'overdue', from_date: '2026-03-01', to_date: '2026-03-31', limit: '25', offset: '0' }))
  })

  it('offers "Mark lost" only while an item is out, but "Mark damaged" for anything not lost', async () => {
    loansApi([loan(), loan({ id: 8, equipment_name: 'Clean Code', state: 'returned' }), loan({ id: 9, equipment_name: 'Old Mouse', state: 'lost' })])
    renderApp('/transactions')
    await screen.findByText('Laptop 02')
    const rowOf = (name) => screen.getByText(name, { selector: 'strong' }).closest('tr')
    expect(within(rowOf('Laptop 02')).getByRole('button', { name: 'Mark lost' })).toBeInTheDocument()
    expect(within(rowOf('Clean Code')).queryByRole('button', { name: 'Mark lost' })).not.toBeInTheDocument()
    expect(within(rowOf('Clean Code')).getByRole('button', { name: 'Mark damaged' })).toBeInTheDocument()
    expect(within(rowOf('Old Mouse')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('marks an item lost, using the replacement cost when no amount is typed', async () => {
    const fetchMock = loansApi([loan()], { 'POST /api/equipment/3/mark-lost': { ok: true, message: 'Marked lost and borrower charged', penalty: null } })
    renderApp('/transactions')
    const row = (await screen.findByText('Laptop 02', { selector: 'strong' })).closest('tr')
    await userEvent.click(within(row).getByRole('button', { name: 'Mark lost' }))
    expect(asks(fetchMock, 'POST', '/api/equipment/3/mark-lost')).toHaveLength(0) // asks first
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark lost' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Marked lost and borrower charged')
    expect(bodyOf(asks(fetchMock, 'POST', '/api/equipment/3/mark-lost')[0])).toEqual({})
  })

  it('marks an item lost with a typed amount and a note', async () => {
    const fetchMock = loansApi([loan()], { 'POST /api/equipment/3/mark-lost': { ok: true, message: 'Marked lost and borrower charged', penalty: null } })
    renderApp('/transactions')
    const row = (await screen.findByText('Laptop 02', { selector: 'strong' })).closest('tr')
    await userEvent.click(within(row).getByRole('button', { name: 'Mark lost' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.type(dialog.getByLabelText('Amount to charge (₱, optional)'), '1500')
    await userEvent.type(dialog.getByLabelText('Note (optional)'), 'Left on a bus')
    await userEvent.click(dialog.getByRole('button', { name: 'Mark lost' }))
    await screen.findByRole('status')
    expect(bodyOf(asks(fetchMock, 'POST', '/api/equipment/3/mark-lost')[0])).toEqual({ amount: 1500, notes: 'Left on a bus' })
  })

  it('shows the server\'s reason when marking lost fails', async () => {
    loansApi([loan()], { 'POST /api/equipment/3/mark-lost': () => jsonResponse({ detail: 'Set a replacement cost on the item or pass an amount' }, 422) })
    renderApp('/transactions')
    const row = (await screen.findByText('Laptop 02', { selector: 'strong' })).closest('tr')
    await userEvent.click(within(row).getByRole('button', { name: 'Mark lost' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark lost' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Set a replacement cost')
  })

  it('needs an amount to record damage, then charges that loan', async () => {
    const fetchMock = loansApi([loan({ state: 'returned' })], { 'POST /api/equipment/3/mark-damaged': { ok: true, message: 'Damage recorded and borrower charged', penalty: null } })
    renderApp('/transactions')
    const row = (await screen.findByText('Laptop 02', { selector: 'strong' })).closest('tr')
    await userEvent.click(within(row).getByRole('button', { name: 'Mark damaged' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Record damage' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent('Enter how much to charge.')
    expect(asks(fetchMock, 'POST', '/api/equipment/3/mark-damaged')).toHaveLength(0)

    await userEvent.type(dialog.getByLabelText('Amount to charge (₱)'), '250')
    await userEvent.selectOptions(dialog.getByLabelText('Condition afterwards'), 'needs_maintenance')
    await userEvent.click(dialog.getByRole('button', { name: 'Record damage' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Damage recorded and borrower charged')
    expect(bodyOf(asks(fetchMock, 'POST', '/api/equipment/3/mark-damaged')[0])).toEqual({ amount: 250, condition: 'needs_maintenance', transaction_id: 7 })
  })
})

describe('Fines', () => {
  function finesApi(fines, extra = {}) {
    return mockApi({
      ...baseRoutes(),
      'GET /api/transactions': { total: 0, items: [] },
      'GET /api/penalties': { total: fines.length, unpaid_total: fines.filter((f) => f.status === 'unpaid').reduce((n, f) => n + f.amount, 0), items: fines },
      ...extra,
    })
  }
  async function openFines() {
    renderApp('/transactions')
    await userEvent.click(await screen.findByRole('tab', { name: 'Fines' }))
    await screen.findAllByText('Juan Dela Cruz', { selector: 'strong' })
  }

  it('starts with the unpaid fines, and shows what is owed in total', async () => {
    const fetchMock = finesApi([fine(), fine({ id: 5, amount: 80, equipment_name: 'Clean Code', type: 'lost' })])
    await openFines()
    expect(lastQuery(fetchMock, '/api/penalties')).toMatchObject({ status: 'unpaid', limit: '25', offset: '0' })
    expect(screen.getByTestId('unpaid-total')).toHaveTextContent('180')
    const row = screen.getByText('Laptop 02').closest('tr')
    expect(row).toHaveTextContent('Late fine')
    expect(row).toHaveTextContent('Unpaid')
  })

  it('sends the status and type filters', async () => {
    const fetchMock = finesApi([fine()])
    await openFines()
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'paid')
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'damaged')
    await waitFor(() => expect(lastQuery(fetchMock, '/api/penalties')).toMatchObject({ status: 'paid', type: 'damaged' }))
  })

  it('marks a fine as paid after confirming', async () => {
    const fetchMock = finesApi([fine()], { 'PATCH /api/penalties/4': fine({ status: 'paid' }) })
    await openFines()
    await userEvent.click(screen.getByRole('button', { name: 'Mark paid' }))
    expect(asks(fetchMock, 'PATCH', '/api/penalties/4')).toHaveLength(0)
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark paid' }))
    expect(await screen.findByRole('status')).toHaveTextContent("Marked Juan Dela Cruz's fine as paid.")
    expect(bodyOf(asks(fetchMock, 'PATCH', '/api/penalties/4')[0])).toEqual({ status: 'paid' })
  })

  it('waives a fine with a note', async () => {
    const fetchMock = finesApi([fine()], { 'PATCH /api/penalties/4': fine({ status: 'waived' }) })
    await openFines()
    await userEvent.click(screen.getByRole('button', { name: 'Waive' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.type(dialog.getByLabelText('Note (optional)'), 'Item was found')
    await userEvent.click(dialog.getByRole('button', { name: 'Waive fine' }))
    expect(await screen.findByRole('status')).toHaveTextContent("Waived Juan Dela Cruz's fine.")
    expect(bodyOf(asks(fetchMock, 'PATCH', '/api/penalties/4')[0])).toEqual({ status: 'waived', notes: 'Item was found' })
  })

  it('can set a paid fine back to unpaid, and shows an error if that fails', async () => {
    finesApi([fine({ status: 'paid' })], { 'PATCH /api/penalties/4': () => jsonResponse({ detail: 'Penalty not found' }, 404) })
    await openFines()
    await userEvent.click(screen.getByRole('button', { name: 'Set unpaid' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Set unpaid' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Penalty not found')
  })
})
