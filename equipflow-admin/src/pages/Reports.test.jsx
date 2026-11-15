import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { baseRoutes, mockApi, renderApp } from '../test/helpers'

const REPORT = {
  period: { from_date: null, to_date: null },
  summary: { total_borrows: 12, returned: 9, returned_late: 3, on_time_rate: 66.7, avg_loan_days: 2.5 },
  most_borrowed: [{ equipment_id: 1, name: 'Laptop 01', category: 'Laptop', borrow_count: 6, late_count: 2, late_rate: 33.3 }],
  frequently_overdue: [{ equipment_id: 2, name: 'Clean Code', category: 'Book', borrow_count: 3, late_count: 3, late_rate: 100 }],
  by_category: [{ category_id: 1, name: 'Laptop', type: 'hardware', borrow_count: 8, avg_loan_days: 2 }],
  by_hour: [{ hour: 9, count: 5 }, { hour: 14, count: 2 }, { hour: 15, count: 0 }],
  by_weekday: [{ weekday: 'Monday', count: 7 }, { weekday: 'Tuesday', count: 3 }],
  maintenance: [{ equipment_id: 1, name: 'Laptop 01', category: 'Laptop', condition: 'damaged', total_borrows: 40, damage_reports: 2, reasons: ['damaged', 'heavy_use'] }],
}
const EMPTY = { ...REPORT, summary: { total_borrows: 0, returned: 0, returned_late: 0, on_time_rate: null, avg_loan_days: null }, most_borrowed: [], frequently_overdue: [], by_category: [], by_hour: [], by_weekday: [], maintenance: [] }

const reportCalls = (fetchMock) => fetchMock.mock.calls.filter(([url]) => new URL(url).pathname === '/api/reports/usage')
const lastQuery = (fetchMock) => Object.fromEntries(new URL(reportCalls(fetchMock).at(-1)[0]).searchParams)

afterEach(() => vi.restoreAllMocks())

describe('Reports', () => {
  it('shows the summary numbers and the tables', async () => {
    mockApi({ ...baseRoutes(), 'GET /api/reports/usage': REPORT })
    renderApp('/reports')
    const summary = await screen.findByRole('region', { name: 'Summary' })
    expect(summary).toHaveTextContent('12')
    expect(summary).toHaveTextContent('66.7%')
    expect(summary).toHaveTextContent('2.5 days')

    expect(within(screen.getByRole('table', { name: 'Most borrowed' })).getByText('Laptop 01')).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Often returned late' })).getByText('Clean Code')).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'By category' })).getByText('Laptop')).toBeInTheDocument()
    const maintenance = screen.getByRole('table', { name: 'May need maintenance or replacing' })
    expect(maintenance).toHaveTextContent('Damaged, Heavily used')
    expect(screen.getByRole('img', { name: 'Busiest weekdays' })).toHaveTextContent('Monday')
    expect(screen.getByRole('img', { name: 'Busiest hours' })).toHaveTextContent('9 AM')
    expect(screen.getByRole('img', { name: 'Busiest hours' })).not.toHaveTextContent('3 PM') // hours with no borrows are left out
  })

  it('asks for everything at first, then only the chosen dates', async () => {
    const fetchMock = mockApi({ ...baseRoutes(), 'GET /api/reports/usage': REPORT })
    renderApp('/reports')
    await screen.findByRole('region', { name: 'Summary' })
    expect(lastQuery(fetchMock)).toEqual({})
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-03-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-03-31' } })
    await waitFor(() => expect(lastQuery(fetchMock)).toEqual({ from_date: '2026-03-01', to_date: '2026-03-31' }))
  })

  it('does not ask the server when the start date is after the end date', async () => {
    const fetchMock = mockApi({ ...baseRoutes(), 'GET /api/reports/usage': REPORT })
    renderApp('/reports')
    await screen.findByRole('region', { name: 'Summary' })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-04-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-03-01' } })
    expect(await screen.findByRole('alert')).toHaveTextContent('The start date must be before the end date.')
    expect(reportCalls(fetchMock).every(([url]) => !new URL(url).searchParams.get('from_date') || !new URL(url).searchParams.get('to_date'))).toBe(true)
  })

  it('says so when nothing was borrowed in the period', async () => {
    mockApi({ ...baseRoutes(), 'GET /api/reports/usage': EMPTY })
    renderApp('/reports')
    const summary = await screen.findByRole('region', { name: 'Summary' })
    expect(summary).toHaveTextContent('0')
    expect(screen.getAllByText('Nothing to show for this period.').length).toBeGreaterThan(0)
    expect(screen.getByText('Nothing needs attention.')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Busiest weekdays' })).not.toBeInTheDocument()
  })

  it('downloads the report as a CSV file', async () => {
    mockApi({ ...baseRoutes(), 'GET /api/reports/usage': REPORT })
    URL.createObjectURL = vi.fn(() => 'blob:report')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderApp('/reports')
    await screen.findByRole('region', { name: 'Summary' })
    await userEvent.click(screen.getByRole('button', { name: 'Download CSV' }))
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('prints the usage report, with its name and period for the paper copy', async () => {
    mockApi({ ...baseRoutes(), 'GET /api/reports/usage': REPORT })
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    renderApp('/reports')
    await screen.findByRole('region', { name: 'Summary' })
    expect(screen.getByText('Usage report')).toBeInTheDocument()
    expect(screen.getByText('Period: All dates')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Print / Save as PDF' }))
    expect(print).toHaveBeenCalledTimes(1)
  })
})
