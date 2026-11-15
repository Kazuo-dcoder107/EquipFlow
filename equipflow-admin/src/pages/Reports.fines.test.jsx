import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { baseRoutes, jsonResponse, mockApi, renderApp } from '../test/helpers'

// Paid at midday UTC, so the date is the same day (or next to it) in any time zone.
const fine = (overrides = {}) => ({
  id: 1, transaction_id: 7, user_id: 5, sr_code: '24-0001', full_name: 'Juan Dela Cruz', equipment_name: 'Laptop 02',
  type: 'overdue_fine', amount: 100, status: 'paid', notes: null, created_at: '2026-03-01T00:00:00Z', resolved_at: '2026-03-05T12:00:00Z', ...overrides,
})
const JUAN_MARCH = fine({ id: 1 })
const MARIA_APRIL = fine({ id: 2, user_id: 6, sr_code: '24-0002', full_name: 'Maria Santos', equipment_name: 'Clean Code', type: 'lost', amount: 50, resolved_at: '2026-04-20T12:00:00Z' })
const JUAN_LATER = fine({ id: 3, amount: 25, resolved_at: '2026-03-10T12:00:00Z', notes: 'Paid at the cashier' })

const penaltyCalls = (fetchMock) => fetchMock.mock.calls.filter(([url]) => new URL(url).pathname === '/api/penalties')
const queryOf = (call) => Object.fromEntries(new URL(call[0]).searchParams)

function finesApi(items) {
  return mockApi({
    ...baseRoutes(),
    'GET /api/reports/usage': { period: {}, summary: { total_borrows: 0, returned: 0, returned_late: 0, on_time_rate: null, avg_loan_days: null }, most_borrowed: [], frequently_overdue: [], by_category: [], by_hour: [], by_weekday: [], maintenance: [] },
    'GET /api/penalties': (url) => {
      const q = new URL(url).searchParams
      const offset = Number(q.get('offset'))
      const limit = Number(q.get('limit'))
      return jsonResponse({ total: items.length, unpaid_total: 0, items: items.filter((f) => f.status === q.get('status')).slice(offset, offset + limit) })
    },
  })
}
async function openFinesReport() {
  renderApp('/reports')
  await userEvent.click(await screen.findByRole('tab', { name: 'Fines paid' }))
  return screen.findByRole('region', { name: 'Summary' })
}

afterEach(() => vi.restoreAllMocks())

describe('Fines paid report', () => {
  it('lists who paid, what and when (newest first), with the total collected', async () => {
    const fetchMock = finesApi([JUAN_MARCH, MARIA_APRIL, JUAN_LATER])
    const summary = await openFinesReport()
    expect(summary).toHaveTextContent('3')       // payments
    expect(summary).toHaveTextContent('175')     // 100 + 50 + 25
    expect(summary).toHaveTextContent('2')       // people: Juan and Maria

    const rows = within(screen.getByRole('table', { name: 'Fines paid' })).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Maria Santos')   // Apr 20 is the newest
    expect(rows[0]).toHaveTextContent('24-0002')
    expect(rows[0]).toHaveTextContent('Lost item')
    expect(rows[0]).toHaveTextContent('Apr')
    expect(rows[0]).toHaveTextContent('2026')
    expect(rows[1]).toHaveTextContent('Paid at the cashier')
    expect(rows[2]).toHaveTextContent('Juan Dela Cruz')
    expect(rows[2]).toHaveTextContent('Mar')

    expect(queryOf(penaltyCalls(fetchMock)[0])).toMatchObject({ status: 'paid', limit: '200', offset: '0' })
  })

  it('shows only the fines paid inside the chosen dates', async () => {
    finesApi([JUAN_MARCH, MARIA_APRIL, JUAN_LATER])
    await openFinesReport()
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-03-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-03-31' } })
    await waitFor(() => expect(within(screen.getByRole('table', { name: 'Fines paid' })).getAllByRole('row')).toHaveLength(3)) // header + 2
    expect(screen.queryByText('Maria Santos')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Summary' })).toHaveTextContent('125')
  })

  it('can show the waived fines instead', async () => {
    const fetchMock = finesApi([JUAN_MARCH, fine({ id: 9, status: 'waived', amount: 80, full_name: 'Wanda Waived' })])
    await openFinesReport()
    await userEvent.selectOptions(screen.getByLabelText('Show'), 'waived')
    expect(await screen.findByText('Wanda Waived')).toBeInTheDocument()
    expect(screen.queryByText('Juan Dela Cruz')).not.toBeInTheDocument()
    expect(screen.getByText('Total waived')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Waived on' })).toBeInTheDocument()
    expect(penaltyCalls(fetchMock).map(queryOf).some((q) => q.status === 'waived')).toBe(true)
  })

  it('reads every page when there are more than 200 fines', async () => {
    const many = Array.from({ length: 250 }, (_, i) => fine({ id: i + 1, user_id: 100 + i, full_name: `Person ${i + 1}` }))
    const fetchMock = finesApi(many)
    const summary = await openFinesReport()
    await waitFor(() => expect(summary).toHaveTextContent('250'))
    expect(penaltyCalls(fetchMock).map((c) => queryOf(c).offset)).toEqual(['0', '200'])
  })

  it('says so when nobody paid in the period', async () => {
    finesApi([])
    await openFinesReport()
    expect(await screen.findByText('No fines were paid in this period.')).toBeInTheDocument()
  })

  it('rejects a start date after the end date', async () => {
    finesApi([JUAN_MARCH])
    await openFinesReport()
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-04-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-03-01' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('The start date must be before the end date.')
    expect(screen.getByRole('button', { name: 'Print / Save as PDF' })).toBeDisabled()
  })

  it('prints (or saves as PDF) with the report name, the period, and who made it', async () => {
    finesApi([JUAN_MARCH])
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    await openFinesReport()
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-03-01' } })
    expect(screen.getByText('Fines paid report')).toBeInTheDocument()   // the print-only heading
    expect(screen.getByText(/^Period: Mar 1, 2026 to today$/)).toBeInTheDocument()
    expect(screen.getByText(/by Demo Admin/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Print / Save as PDF' }))
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('downloads the payments as a CSV file', async () => {
    finesApi([JUAN_MARCH])
    URL.createObjectURL = vi.fn(() => 'blob:fines')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await openFinesReport()
    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }))
    expect(URL.createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(click).toHaveBeenCalledTimes(1)
  })
})
