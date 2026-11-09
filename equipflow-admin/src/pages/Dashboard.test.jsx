import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { STATS, baseRoutes, jsonResponse, mockApi, renderApp } from '../test/helpers'

const tile = (label) => screen.getByText(label).closest('.tile')

describe('Dashboard', () => {
  it('shows how equipment, people and fines stand', async () => {
    mockApi({ ...baseRoutes(), 'GET /api/dashboard/stats': STATS })
    renderApp('/')
    expect(await screen.findByText('Available')).toBeInTheDocument()

    expect(within(tile('Total')).getByText('30')).toBeInTheDocument()
    expect(within(tile('Available')).getByText('21')).toBeInTheDocument()
    expect(within(tile('Borrowed')).getByText('6')).toBeInTheDocument()
    expect(within(tile('Overdue')).getByText('2')).toBeInTheDocument()
    expect(within(tile('Missing')).getByText('1')).toBeInTheDocument()
    expect(within(tile('Borrowed today')).getByText('9')).toBeInTheDocument()
    expect(within(tile('Returned today')).getByText('7')).toBeInTheDocument()
    expect(within(tile('Students with ID card')).getByText('35')).toBeInTheDocument()
    expect(within(tile('Waiting for ID card')).getByText('5')).toBeInTheDocument()
    expect(within(tile('Unpaid fines')).getByText('\u20B1180')).toBeInTheDocument()
  })

  it('puts what needs attention first, with a link to the waiting approvals', async () => {
    mockApi({ ...baseRoutes(), 'GET /api/dashboard/stats': STATS })
    renderApp('/')
    const strip = await screen.findByRole('region', { name: 'Needs attention' })
    const link = within(strip).getByRole('link')
    expect(link).toHaveTextContent('3 sign-up requests are waiting for approval')
    expect(link).toHaveAttribute('href', '/approvals')
    expect(strip).toHaveTextContent('2 items are overdue')
    expect(strip).toHaveTextContent('4 unpaid fines, \u20B1180 in total')
  })

  it('uses singular wording for one request', async () => {
    const one = { ...STATS, users: { ...STATS.users, pending_approval: 1 }, equipment: { ...STATS.equipment, overdue: 1 }, penalties: { unpaid_count: 1, unpaid_total: 25 } }
    mockApi({ ...baseRoutes(), 'GET /api/dashboard/stats': one })
    renderApp('/')
    const strip = await screen.findByRole('region', { name: 'Needs attention' })
    expect(strip).toHaveTextContent('1 sign-up request is waiting for approval')
    expect(strip).toHaveTextContent('1 item is overdue')
    expect(strip).toHaveTextContent('1 unpaid fine, \u20B125 in total')
  })

  it('lists overdue items, most overdue first, with the borrower and the fine so far', async () => {
    mockApi({ ...baseRoutes(), 'GET /api/dashboard/stats': STATS })
    renderApp('/')
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Laptop 02')
    expect(rows[0]).toHaveTextContent('Juan Dela Cruz')
    expect(rows[0]).toHaveTextContent('4 days')
    expect(rows[0]).toHaveTextContent('\u20B1100')
    expect(rows[1]).toHaveTextContent('1 day')
  })

  it('stays calm when nothing needs attention', async () => {
    const calm = {
      equipment: { total: 5, available: 5, borrowed: 0, overdue: 0, missing: 0 },
      users: { students: 2, enrolled: 2, pending_enrollment: 0, pending_approval: 0 },
      penalties: { unpaid_count: 0, unpaid_total: 0 }, today: { borrows: 0, returns: 0 }, overdue_items: [],
    }
    mockApi({ ...baseRoutes(), 'GET /api/dashboard/stats': calm })
    renderApp('/')
    expect(await screen.findByText('Nothing is overdue')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Needs attention' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('offers a retry when the numbers cannot be loaded', async () => {
    let calls = 0
    mockApi({ ...baseRoutes(), 'GET /api/dashboard/stats': () => (++calls === 1 ? jsonResponse({ detail: 'Server error' }, 500) : jsonResponse(STATS)) })
    renderApp('/')
    expect(await screen.findByRole('alert')).toHaveTextContent('Server error')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Available')).toBeInTheDocument()
  })
})
