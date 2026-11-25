import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { baseRoutes, jsonResponse, mockApi, renderApp } from '../test/helpers'

const CATS = [
  { id: 1, name: 'Laptop', type: 'hardware', loan_days: 3, fine_per_day: 50, equipment_count: 2 },
  { id: 2, name: 'Book', type: 'book', loan_days: 7, fine_per_day: 5, equipment_count: 0 },
]
const GENRES = [{ id: 1, name: 'Fiction', book_count: 2 }, { id: 2, name: 'Science', book_count: 0 }]
const item = (overrides = {}) => ({
  id: 1, asset_number: 'EQ_EF-000001', name: 'Laptop 01', category_id: 1, category: 'Laptop', type: 'hardware', genre_id: null, genre: null, status: 'available',
  condition: 'good', tag_uid: '04AA0001', replacement_cost: 30000, created_at: '2026-03-01T00:00:00Z', ...overrides,
})

const asks = (fetchMock, method, path) => fetchMock.mock.calls.filter(([url, o]) => (o?.method || 'GET') === method && new URL(url).pathname === path)
const bodyOf = (call) => JSON.parse(call[1].body)
const queryOf = (call) => Object.fromEntries(new URL(call[0]).searchParams)
const lastQuery = (fetchMock, path) => queryOf(asks(fetchMock, 'GET', path).at(-1))

function api(extra = {}, items = [item()]) {
  return mockApi({
    ...baseRoutes(),
    'GET /api/categories': CATS,
    'GET /api/genres': GENRES,
    'GET /api/equipment': { total: items.length, items },
    ...extra,
  })
}

describe('Equipment page: items', () => {
  it('is in the menu, and lists each item with its tag, category, status, condition and cost', async () => {
    api({}, [item(), 
      item({
        id: 2,
        asset_number: 'BK_EF-000001',
        name: 'Clean Code',
        category_id: 2,
        category: 'Book',
        type: 'book',
        genre_id: 1,
        genre: 'Fiction',
        status: 'overdue',
        condition: 'damaged',
        tag_uid: '04BB0002',
        replacement_cost: 450
})])
    renderApp('/equipment')
    const row = (await screen.findByText('Clean Code', { selector: 'strong' })).closest('tr')
    expect(row).toHaveTextContent('04BB0002')
    expect(row).toHaveTextContent('BK_EF-000001')
    expect(row).toHaveTextContent('Book')
    expect(row).toHaveTextContent('Fiction')
    expect(row).toHaveTextContent('Overdue')
    expect(row).toHaveTextContent('Damaged')
    expect(row).toHaveTextContent('450')
    for (const name of ['Equipment', 'Loans', 'Reports', 'Programs']) {
      expect(screen.getByRole('link', { name: new RegExp(name) })).toBeInTheDocument()
    }
  })

  it('sends the search once typing pauses, and the type, category and status filters', async () => {
    const fetchMock = api()
    renderApp('/equipment')
    await screen.findByText('Laptop 01')
    await userEvent.type(screen.getByLabelText('Search'), 'lap')
    await userEvent.selectOptions(screen.getByLabelText('Type'), 'hardware')
    await userEvent.selectOptions(screen.getByLabelText('Category'), '1')
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'overdue')
    await waitFor(() => expect(lastQuery(fetchMock, '/api/equipment')).toMatchObject({ search: 'lap', type: 'hardware', category_id: '1', status: 'overdue', limit: '25', offset: '0' }))
  })

  it('adds a book: genres appear for a book category, and the form is sent as typed', async () => {
    const fetchMock = api({ 'POST /api/equipment': (url, o) => jsonResponse({ ...item({ id: 9 }), ...JSON.parse(o.body) }, 201) })
    renderApp('/equipment')
    await screen.findByText('Laptop 01')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add item' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }))

    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.queryByLabelText('Genre')).not.toBeInTheDocument() // no category chosen yet
    await userEvent.type(dialog.getByLabelText('Name'), '  Clean Code ')
    await userEvent.type(dialog.getByLabelText('Tag UID'), '04aa0009')
    await userEvent.selectOptions(dialog.getByLabelText('Category'), '2')
    await userEvent.selectOptions(dialog.getByLabelText('Genre'), '1')
    await userEvent.clear(dialog.getByLabelText('Replacement cost (₱)'))
    await userEvent.type(dialog.getByLabelText('Replacement cost (₱)'), '500')
    await userEvent.click(dialog.getByRole('button', { name: 'Add item' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Added Clean Code.')
    expect(bodyOf(asks(fetchMock, 'POST', '/api/equipment')[0])).toEqual({
      tag_uid: '04aa0009', name: 'Clean Code', category_id: 2, genre_id: 1, replacement_cost: 500, condition: 'good',
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the server\'s message when a tag is already used, and keeps the form open', async () => {
    api({ 'POST /api/equipment': () => jsonResponse({ detail: 'Tag UID already in use (an item or an ID tag)' }, 409) })
    renderApp('/equipment')
    await screen.findByText('Laptop 01')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add item' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.type(dialog.getByLabelText('Name'), 'Laptop 09')
    await userEvent.type(dialog.getByLabelText('Tag UID'), '04AA0001')
    await userEvent.selectOptions(dialog.getByLabelText('Category'), '1')
    await userEvent.click(dialog.getByRole('button', { name: 'Add item' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent('Tag UID already in use')
  })

  it('edits an item, starting from its current values', async () => {
    const fetchMock = api({ 'PATCH /api/equipment/1': (url, o) => jsonResponse({ ...item(), ...JSON.parse(o.body) }) })
    renderApp('/equipment')
    const row = (await screen.findByText('Laptop 01', { selector: 'strong' })).closest('tr')
    await userEvent.click(within(row).getByRole('button', { name: 'Edit' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByLabelText('Name')).toHaveValue('Laptop 01')
    expect(dialog.getByLabelText('Tag UID')).toHaveValue('04AA0001')
    await userEvent.selectOptions(dialog.getByLabelText('Condition'), 'needs_maintenance')
    await userEvent.click(dialog.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Saved Laptop 01.')
    expect(bodyOf(asks(fetchMock, 'PATCH', '/api/equipment/1')[0])).toMatchObject({ category_id: 1, genre_id: null, replacement_cost: 30000, condition: 'needs_maintenance' })
  })

  it('asks before deleting, and explains when an item has history and cannot be deleted', async () => {
    const fetchMock = api({ 'DELETE /api/equipment/1': () => jsonResponse({ detail: 'Item has borrowing history and cannot be deleted' }, 409) })
    renderApp('/equipment')
    const row = (await screen.findByText('Laptop 01', { selector: 'strong' })).closest('tr')
    await userEvent.click(within(row).getByRole('button', { name: 'Delete' }))
    expect(asks(fetchMock, 'DELETE', '/api/equipment/1')).toHaveLength(0) // not yet
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete item' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Item has borrowing history')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('deletes an item that was never borrowed', async () => {
    const fetchMock = api({ 'DELETE /api/equipment/1': { ok: true } })
    renderApp('/equipment')
    const row = (await screen.findByText('Laptop 01', { selector: 'strong' })).closest('tr')
    await userEvent.click(within(row).getByRole('button', { name: 'Delete' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete item' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Deleted Laptop 01.')
    expect(asks(fetchMock, 'DELETE', '/api/equipment/1')).toHaveLength(1)
  })
})

describe('Equipment page: categories', () => {
  async function openCategories(extra) {
    const fetchMock = api(extra)
    renderApp('/equipment')
    await userEvent.click(await screen.findByRole('tab', { name: 'Categories' }))
    await screen.findByText('Laptop', { selector: 'strong' })
    return fetchMock
  }

  it('lists the loan length, fine per day and item count', async () => {
    await openCategories()
    const row = screen.getByText('Laptop', { selector: 'strong' }).closest('tr')
    expect(row).toHaveTextContent('3 days')
    expect(row).toHaveTextContent('50')
    expect(row).toHaveTextContent('2')
  })

  it('adds a category', async () => {
    const fetchMock = await openCategories({ 'POST /api/categories': { ...CATS[1], id: 3, name: 'Projector', type: 'hardware' } })
    await userEvent.click(screen.getByRole('button', { name: 'Add category' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.type(dialog.getByLabelText('Name'), 'Projector')
    await userEvent.clear(dialog.getByLabelText('Loan days'))
    await userEvent.type(dialog.getByLabelText('Loan days'), '2')
    await userEvent.clear(dialog.getByLabelText('Fine per day (₱)'))
    await userEvent.type(dialog.getByLabelText('Fine per day (₱)'), '100')
    await userEvent.click(dialog.getByRole('button', { name: 'Add category' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Added Projector.')
    expect(bodyOf(asks(fetchMock, 'POST', '/api/categories')[0])).toEqual({ name: 'Projector', type: 'hardware', loan_days: 2, fine_per_day: 100 })
  })

  it('does not let the type change once a category has items', async () => {
    await openCategories()
    const row = screen.getByText('Laptop', { selector: 'strong' }).closest('tr')
    await userEvent.click(within(row).getByRole('button', { name: 'Edit' }))
    expect(within(screen.getByRole('dialog')).getByLabelText('Type')).toBeDisabled()
  })

  it('shows the server\'s reason when a category cannot be deleted', async () => {
    await openCategories({ 'DELETE /api/categories/1': () => jsonResponse({ detail: 'Category still has equipment' }, 409) })
    const row = screen.getByText('Laptop', { selector: 'strong' }).closest('tr')
    await userEvent.click(within(row).getByRole('button', { name: 'Delete' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete category' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Category still has equipment')
  })
})

describe('Equipment page: genres', () => {
  async function openGenres(extra) {
    const fetchMock = api(extra)
    renderApp('/equipment')
    await userEvent.click(await screen.findByRole('tab', { name: 'Genres' }))
    await screen.findByText('Fiction', { selector: 'strong' })
    return fetchMock
  }

  it('adds and renames a genre', async () => {
    const fetchMock = await openGenres({ 'POST /api/genres': { id: 3, name: 'History', book_count: 0 }, 'PATCH /api/genres/2': { id: 2, name: 'Sciences', book_count: 0 } })
    await userEvent.click(screen.getByRole('button', { name: 'Add genre' }))
    await userEvent.type(within(screen.getByRole('dialog')).getByLabelText('Name'), 'History')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add genre' }))
    expect(await screen.findByText('Added History.')).toBeInTheDocument()
    expect(bodyOf(asks(fetchMock, 'POST', '/api/genres')[0])).toEqual({ name: 'History' })

    const row = screen.getByText('Science', { selector: 'strong' }).closest('tr')
    await userEvent.click(within(row).getByRole('button', { name: 'Rename' }))
    const field = within(screen.getByRole('dialog')).getByLabelText('Name')
    await userEvent.clear(field)
    await userEvent.type(field, 'Sciences')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Renamed to Sciences.')).toBeInTheDocument()
    expect(bodyOf(asks(fetchMock, 'PATCH', '/api/genres/2')[0])).toEqual({ name: 'Sciences' })
  })

  it('deletes an unused genre with no choices to make', async () => {
    const fetchMock = await openGenres({ 'DELETE /api/genres/2': { ok: true, books_moved: 0 } })
    const row = screen.getByText('Science', { selector: 'strong' }).closest('tr')
    await userEvent.click(within(row).getByRole('button', { name: 'Delete' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete genre' }))
    expect(await screen.findByText('Deleted Science.')).toBeInTheDocument()
    expect(queryOf(asks(fetchMock, 'DELETE', '/api/genres/2')[0])).toEqual({})
  })

  it('moves the books to another genre when deleting a genre that is in use', async () => {
    const fetchMock = await openGenres({ 'DELETE /api/genres/1': { ok: true, books_moved: 2 } })
    const row = screen.getByText('Fiction', { selector: 'strong' }).closest('tr')
    await userEvent.click(within(row).getByRole('button', { name: 'Delete' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(screen.getByRole('dialog')).toHaveTextContent('2 book(s) use this genre')
    await userEvent.selectOptions(dialog.getByLabelText('Books go to'), '2')
    await userEvent.click(dialog.getByRole('button', { name: 'Delete genre' }))
    expect(await screen.findByText('Deleted Fiction.')).toBeInTheDocument()
    expect(queryOf(asks(fetchMock, 'DELETE', '/api/genres/1')[0])).toEqual({ reassign_to: '2' })
  })

  it('leaves the books without a genre when no other genre is chosen', async () => {
    const fetchMock = await openGenres({ 'DELETE /api/genres/1': { ok: true, books_moved: 2 } })
    const row = screen.getByText('Fiction', { selector: 'strong' }).closest('tr')
    await userEvent.click(within(row).getByRole('button', { name: 'Delete' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete genre' }))
    expect(await screen.findByText('Deleted Fiction.')).toBeInTheDocument()
    expect(queryOf(asks(fetchMock, 'DELETE', '/api/genres/1')[0])).toEqual({ detach: 'true' })
  })
})
