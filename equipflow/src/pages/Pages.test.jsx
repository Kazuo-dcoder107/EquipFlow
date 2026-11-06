import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEPARTMENTS, STUDENT, hoursFromNow, jsonResponse, loan, mockApi, renderApp } from '../test/helpers'

const ME = { 'GET /api/auth/me': STUDENT, 'GET /api/departments': DEPARTMENTS }
const queryOf = (call) => Object.fromEntries(new URL(call[0]).searchParams)
const callsTo = (fetchMock, path) => fetchMock.mock.calls.filter((c) => new URL(c[0]).pathname === path)

describe('Home', () => {
  const rec = { id: 5, name: 'Clean Code', category: 'Book', type: 'book', genre: 'Programming', status: 'available', reason: 'Because you often borrow Programming books' }
  const base = {
    ...ME,
    'GET /api/me/summary': { borrowed_now: 2, overdue_now: 1, unpaid_total: 75 },
    'GET /api/me/transactions': {
      total: 3,
      items: [
        loan({ id: 1, equipment_name: 'Later Laptop', due_at: hoursFromNow(96) }),
        loan({ id: 2, equipment_name: 'Late Camera', due_at: hoursFromNow(-30), state: 'overdue', fine: 50 }),
        loan({ id: 3, equipment_name: 'Done Book', state: 'returned', returned_at: hoursFromNow(-5) }),
      ],
    },
    'GET /api/me/recommendations': { strategy: 'history', borrowing_blocked: null, top_categories: [], top_genres: [], items: [rec] },
  }

  it('shows the summary, the loans that are due first, and a suggestion with its reason', async () => {
    mockApi(base)
    renderApp('/')
    expect(await screen.findByRole('heading', { name: 'Hello, Juan' })).toBeInTheDocument()

    expect(await screen.findByText('Borrowed now')).toBeInTheDocument()
    expect(screen.getByText('\u20B175')).toBeInTheDocument()

    const loans = await screen.findAllByRole('heading', { level: 3 })
    const names = loans.map((h) => h.textContent)
    expect(names.indexOf('Late Camera')).toBeLessThan(names.indexOf('Later Laptop')) // soonest due first
    expect(names).not.toContain('Done Book') // returned loans are not "due soon"
    expect(screen.getByText('Because you often borrow Programming books')).toBeInTheDocument()
  })

  it('keeps working when one section fails', async () => {
    mockApi({ ...base, 'GET /api/me/recommendations': () => jsonResponse({ detail: 'boom' }, 500) })
    renderApp('/')
    expect(await screen.findByText('Late Camera')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
  })

  it('tells a teacher still waiting for approval what is happening', async () => {
    mockApi({ ...base, 'GET /api/auth/me': { ...STUDENT, role: 'teacher', status: 'pending_approval', rfid_linked: false } })
    renderApp('/')
    expect(await screen.findByText('Waiting for approval')).toBeInTheDocument()
  })

  it('tells a student to link their ID card', async () => {
    mockApi({ ...base, 'GET /api/auth/me': { ...STUDENT, status: 'pending_enrollment', rfid_linked: false } })
    renderApp('/')
    expect(await screen.findByText(/Link your ID card at the kiosk/)).toBeInTheDocument()
  })

  it('warns about a deactivated card', async () => {
    mockApi({ ...base, 'GET /api/auth/me': { ...STUDENT, rfid_active: false } })
    renderApp('/')
    expect(await screen.findByText('ID card deactivated')).toBeInTheDocument()
  })
})

describe('My loans', () => {
  const data = {
    ...ME,
    'GET /api/me/transactions': {
      total: 4,
      items: [
        loan({ id: 1, equipment_name: 'Later Laptop', due_at: hoursFromNow(120) }),
        loan({ id: 2, equipment_name: 'Late Camera', due_at: hoursFromNow(-50), state: 'overdue', fine: 75 }),
        loan({ id: 3, equipment_name: 'Old Book', state: 'returned', borrowed_at: hoursFromNow(-500), returned_at: hoursFromNow(-400), fine: 0 }),
        loan({ id: 4, equipment_name: 'New Book', state: 'returned', borrowed_at: hoursFromNow(-100), returned_at: hoursFromNow(-60), fine: 25 }),
      ],
    },
  }

  it('lists current loans soonest first with days left or days late, and the live fine', async () => {
    mockApi(data)
    renderApp('/loans')
    expect(await screen.findByRole('tab', { name: 'Borrowed now (2)' })).toBeInTheDocument()

    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titles).toEqual(['Late Camera', 'Later Laptop'])
    expect(screen.getByText('Overdue by 3 days')).toBeInTheDocument()
    expect(screen.getByText('Due in 4 days')).toBeInTheDocument()
    expect(screen.getByText('Fine so far: \u20B175')).toBeInTheDocument()
  })

  it('shows finished loans, newest first, on the History tab', async () => {
    mockApi(data)
    renderApp('/loans')
    await userEvent.click(await screen.findByRole('tab', { name: 'History (2)' }))

    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titles).toEqual(['New Book', 'Old Book'])
    expect(screen.getAllByText('Returned')).toHaveLength(2)
    expect(screen.getByText('Fine: \u20B125')).toBeInTheDocument()
  })

  it('explains an empty list', async () => {
    mockApi({ ...ME, 'GET /api/me/transactions': { total: 0, items: [] } })
    renderApp('/loans')
    expect(await screen.findByText('Nothing borrowed right now')).toBeInTheDocument()
  })

  it('offers a retry when loading fails', async () => {
    let calls = 0
    mockApi({
      ...ME,
      'GET /api/me/transactions': () => (++calls === 1 ? jsonResponse({ detail: 'Server error' }, 500) : jsonResponse({ total: 0, items: [] })),
    })
    renderApp('/loans')
    expect(await screen.findByRole('alert')).toHaveTextContent('Server error')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Nothing borrowed right now')).toBeInTheDocument()
  })
})

describe('Fine tickets', () => {
  const fine = (overrides) => ({
    id: 1, transaction_id: 1, user_id: 1, sr_code: '24-0001', full_name: 'Juan', equipment_name: 'Laptop 05',
    type: 'overdue_fine', amount: 50, status: 'unpaid', notes: null, created_at: '2026-02-01T00:00:00Z', resolved_at: null, ...overrides,
  })

  it('puts unpaid fines first, with a reference and QR code only for unpaid ones', async () => {
    mockApi({
      ...ME,
      'GET /api/me/penalties': {
        total: 3, unpaid_total: 120,
        items: [
          fine({ id: 1, status: 'paid', equipment_name: 'Paid Item', created_at: '2026-03-01T00:00:00Z' }),
          fine({ id: 2, equipment_name: 'Lost Book', type: 'lost', amount: 120 }),
          fine({ id: 3, status: 'waived', equipment_name: 'Waived Item' }),
        ],
      },
    })
    renderApp('/fines')
    expect(await screen.findByText('Total unpaid')).toBeInTheDocument()
    expect(screen.getByText(/cannot borrow again/)).toBeInTheDocument()

    const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titles).toEqual(['Lost Book', 'Paid Item', 'Waived Item'])
    expect(screen.getByText('FINE-000002')).toBeInTheDocument()
    expect(screen.getByText('Lost item', { exact: false })).toBeInTheDocument()
    expect(screen.getAllByTitle(/QR code for/)).toHaveLength(1)
    expect(screen.getByTitle('QR code for FINE-000002')).toBeInTheDocument()
  })

  it('celebrates having no fines', async () => {
    mockApi({ ...ME, 'GET /api/me/penalties': { total: 0, unpaid_total: 0, items: [] } })
    renderApp('/fines')
    expect(await screen.findByText('No fines')).toBeInTheDocument()
    expect(screen.queryByText(/cannot borrow again/)).not.toBeInTheDocument()
  })
})

describe('Recommended', () => {
  const items = [
    { id: 1, name: 'Algorithms', category: 'Book', type: 'book', genre: 'Programming', reason: 'Because you often borrow Programming books', score: 1.2 },
    { id: 2, name: 'Laptop 02', category: 'Laptop', type: 'hardware', genre: null, reason: 'Because you often borrow Laptop', score: 0.4 },
  ]

  it('explains each suggestion and what they are based on', async () => {
    mockApi({
      ...ME,
      'GET /api/me/recommendations': {
        strategy: 'history', borrowing_blocked: null, items,
        top_categories: [{ id: 1, name: 'Book', borrows: 5 }], top_genres: [{ id: 1, name: 'Programming', borrows: 4 }],
      },
    })
    renderApp('/recommended')
    expect(await screen.findByText('Algorithms')).toBeInTheDocument()
    expect(screen.getByText('Because you often borrow Laptop')).toBeInTheDocument()
    expect(screen.getByText(/Based on what you borrow most: Book/)).toBeInTheDocument()
  })

  it('says why borrowing is blocked, and handles brand-new users', async () => {
    mockApi({
      ...ME,
      'GET /api/me/recommendations': { strategy: 'popular', borrowing_blocked: 'unpaid_fine', top_categories: [], top_genres: [], items },
    })
    renderApp('/recommended')
    expect(await screen.findByText(/unpaid fine/)).toBeInTheDocument()
    expect(screen.getByText(/here is what is popular/)).toBeInTheDocument()
  })
})

describe('Browse', () => {
  const item = (id, name, extra = {}) => ({ id, name, category: 'Book', category_id: 1, type: 'book', genre: null, status: 'available', condition: 'good', ...extra })

  function setup(total = 3) {
    return mockApi({
      ...ME,
      'GET /api/categories': [{ id: 1, name: 'Book', type: 'book' }, { id: 2, name: 'Laptop', type: 'hardware' }],
      'GET /api/genres': [{ id: 7, name: 'Science Fiction', book_count: 2 }],
      'GET /api/equipment': () => jsonResponse({ total, items: [item(1, 'Dune', { genre: 'Science Fiction' }), item(2, 'Laptop 01', { status: 'borrowed' })] }),
    })
  }

  it('lists items with their status and genre', async () => {
    setup()
    renderApp('/browse')
    expect(await screen.findByText('Dune')).toBeInTheDocument()
    expect(screen.getByText('Available')).toBeInTheDocument()
    expect(screen.getByText('Borrowed')).toBeInTheDocument()
    expect(within(screen.getByText('Dune').closest('article')).getByText('Science Fiction')).toBeInTheDocument()
  })

  it('sends the filters to the API, waiting for typing to pause', async () => {
    const fetchMock = setup()
    renderApp('/browse')
    await screen.findByText('Dune')

    await userEvent.type(screen.getByLabelText('Search by name'), 'dune')
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'Book')
    await userEvent.selectOptions(screen.getByLabelText('Genre'), 'Science Fiction')
    await userEvent.click(screen.getByLabelText('Available only'))

    await waitFor(() => {
      const last = queryOf(callsTo(fetchMock, '/api/equipment').at(-1))
      expect(last).toMatchObject({ search: 'dune', category_id: '1', genre_id: '7', status: 'available', limit: '20' })
    })
    // typing "dune" must not have caused one request per letter
    const searches = callsTo(fetchMock, '/api/equipment').map(queryOf).map((q) => q.search).filter(Boolean)
    expect(new Set(searches)).toEqual(new Set(['dune']))
  })

  it('loads the next page on request and resets it when a filter changes', async () => {
    const fetchMock = setup(45)
    renderApp('/browse')
    await userEvent.click(await screen.findByRole('button', { name: /Show more \(2 of 45\)/ }))
    await waitFor(() => expect(queryOf(callsTo(fetchMock, '/api/equipment').at(-1)).limit).toBe('40'))

    await userEvent.click(screen.getByLabelText('Available only'))
    await waitFor(() => expect(queryOf(callsTo(fetchMock, '/api/equipment').at(-1)).limit).toBe('20'))
  })

  describe('genre filter', () => {
    const genreFilter = () => screen.getByLabelText('Genre')

    it('switches off for a hardware category and back on for books or all categories', async () => {
      setup()
      renderApp('/browse')
      await screen.findByText('Dune')
      expect(genreFilter()).toBeEnabled()

      await userEvent.selectOptions(screen.getByLabelText('Category'), 'Laptop')
      expect(genreFilter()).toBeDisabled()
      expect(within(genreFilter()).getByRole('option', { name: 'Books only' })).toBeInTheDocument()
      expect(genreFilter()).toHaveAttribute('title', 'Genres only apply to books')

      await userEvent.selectOptions(screen.getByLabelText('Category'), 'Book')
      expect(genreFilter()).toBeEnabled()
      await userEvent.selectOptions(screen.getByLabelText('Category'), 'Laptop')
      await userEvent.selectOptions(screen.getByLabelText('Category'), '')
      expect(genreFilter()).toBeEnabled()
    })

    it('forgets a chosen genre when a hardware category is picked, so it cannot hide every result', async () => {
      const fetchMock = setup()
      renderApp('/browse')
      await screen.findByText('Dune')
      await userEvent.selectOptions(genreFilter(), 'Science Fiction')
      await waitFor(() => expect(queryOf(callsTo(fetchMock, '/api/equipment').at(-1))).toMatchObject({ genre_id: '7' }))

      await userEvent.selectOptions(screen.getByLabelText('Category'), 'Laptop')
      await waitFor(() => expect(queryOf(callsTo(fetchMock, '/api/equipment').at(-1))).toMatchObject({ category_id: '2' }))
      expect(queryOf(callsTo(fetchMock, '/api/equipment').at(-1))).not.toHaveProperty('genre_id')

      await userEvent.selectOptions(screen.getByLabelText('Category'), 'Book')
      expect(genreFilter()).toHaveValue('') // it stays cleared; nothing quietly comes back
    })

    it('goes by the category type, so Arduino Kit, Projector and any new hardware category all switch it off', async () => {
      mockApi({
        ...ME,
        'GET /api/categories': [
          { id: 1, name: 'Book', type: 'book' }, { id: 2, name: 'Arduino Kit', type: 'hardware' },
          { id: 3, name: 'Laptop', type: 'hardware' }, { id: 4, name: 'Projector', type: 'hardware' },
          { id: 5, name: 'Drone Kit', type: 'hardware' }, { id: 6, name: 'Textbook', type: 'book' },
        ],
        'GET /api/genres': [{ id: 7, name: 'Science Fiction', book_count: 2 }],
        'GET /api/equipment': { total: 0, items: [] },
      })
      renderApp('/browse')
      await screen.findByText('Nothing found')
      for (const [name, isHardware] of [['Arduino Kit', true], ['Laptop', true], ['Projector', true], ['Drone Kit', true], ['Book', false], ['Textbook', false]]) {
        await userEvent.selectOptions(screen.getByLabelText('Category'), name)
        if (isHardware) expect(genreFilter()).toBeDisabled(); else expect(genreFilter()).toBeEnabled()
      }
    })
  })

  it('has an empty state', async () => {
    mockApi({
      ...ME, 'GET /api/categories': [], 'GET /api/genres': [],
      'GET /api/equipment': { total: 0, items: [] },
    })
    renderApp('/browse')
    expect(await screen.findByText('Nothing found')).toBeInTheDocument()
  })
})

describe('Profile', () => {
  it('shows the account, the card status, and signs out', async () => {
    mockApi(ME)
    renderApp('/profile')
    expect(await screen.findByText('juan@example.com')).toBeInTheDocument()
    expect(screen.getByText('Linked and active')).toBeInTheDocument()
    expect(screen.getByText('Student')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(localStorage.getItem('equipflow.token')).toBeNull()
  })

  it('shows when the card is not linked yet', async () => {
    mockApi({ 'GET /api/auth/me': { ...STUDENT, status: 'pending_enrollment', rfid_linked: false } })
    renderApp('/profile')
    expect(await screen.findByText('Not linked yet')).toBeInTheDocument()
  })
})
