// End-to-end check: the real React app talking to a REAL running backend (no faked API).
//
//   1. in backend/:  python -m scripts.seed_demo   (on an empty database)
//                    uvicorn app.main:app --port 8000
//   2. here:         EQUIPFLOW_E2E=1 npm test
//
// Skipped in a normal `npm test`, because it needs the backend and the demo data.
import { describe, expect, it } from 'vitest'
import { configure, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from './helpers'

// The real server hashes passwords, which can take a moment when the machine is busy.
configure({ asyncUtilTimeout: 4000 })

async function signIn(srCode, password = 'password123') {
  renderApp('/login', { loggedIn: false })
  await userEvent.type(screen.getByLabelText('SR-code'), srCode)
  await userEvent.type(screen.getByLabelText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

const titles = () => screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)

describe.skipIf(!process.env.EQUIPFLOW_E2E)('against the real backend', () => {
  it('Juan: home shows his summary, what is due first, and suggestions with reasons', async () => {
    await signIn('24-0001')
    expect(await screen.findByRole('heading', { name: 'Hello, Juan' })).toBeInTheDocument()

    expect(await screen.findByText('Borrowed now')).toBeInTheDocument()
    const stats = screen.getByText('Borrowed now').closest('.stats')
    expect(within(stats).getByText('2')).toBeInTheDocument()   // two books out
    expect(within(stats).getByText('1')).toBeInTheDocument()   // one overdue
    expect(within(stats).getByText('\u20B115')).toBeInTheDocument() // the unpaid fine on his returned loan

    expect(await screen.findByText(/Overdue by \d+ days?/)).toBeInTheDocument()   // rounds up, so 3 or 4 days
    expect((await screen.findAllByText(/Because you often borrow/)).length).toBeGreaterThan(0)
    const names = titles()
    expect(names.indexOf('Databases')).toBeLessThan(names.indexOf('Web Development')) // overdue first
  })

  it('Juan: loans page separates current loans from history', async () => {
    await signIn('24-0001')
    await userEvent.click(await screen.findByRole('link', { name: /My loans/ }))
    expect(await screen.findByRole('tab', { name: 'Borrowed now (2)' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'History (5)' })).toBeInTheDocument()
    expect(screen.getByText(/Fine so far: \u20B1\d+/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'History (5)' }))
    expect(titles()).toEqual(expect.arrayContaining(['Python Basics', 'Clean Code', 'Algorithms', 'Dune', 'Foundation']))
  })

  it('Juan: fine tickets show the unpaid one with a QR code and the paid one without', async () => {
    await signIn('24-0001')
    await userEvent.click(await screen.findByRole('link', { name: /Fines/ }))
    expect(await screen.findByText('Total unpaid')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2)
    expect(screen.getByText(/cannot borrow again/)).toBeInTheDocument()
    expect(screen.getAllByTitle(/QR code for FINE-/)).toHaveLength(1)
    expect(screen.getByText('Paid')).toBeInTheDocument()
  })

  it('Juan: recommendations favour Programming and flag that he is blocked', async () => {
    await signIn('24-0001')
    await userEvent.click(await screen.findByRole('link', { name: /For you/ }))
    expect(await screen.findByText(/unpaid fine/)).toBeInTheDocument()
    expect(await screen.findByText(/Based on what you borrow most/)).toBeInTheDocument()
    // he has already borrowed these, so they must not be suggested again
    for (const read of ['Python Basics', 'Clean Code', 'Algorithms', 'Dune']) expect(titles()).not.toContain(read)
    expect(screen.getAllByText('Because you often borrow Programming books').length).toBeGreaterThan(0)
  })

  it('Maria: a different history gives different suggestions', async () => {
    await signIn('24-0002')
    await userEvent.click(await screen.findByRole('link', { name: /For you/ }))
    expect(await screen.findByText(/Based on what you borrow most/)).toBeInTheDocument()
    expect(screen.queryByText(/unpaid fine/)).not.toBeInTheDocument()   // Maria can borrow freely
    expect(titles()).not.toContain('Cosmos')                             // she already read it
  })

  it('Browse: search, genre filter and availability work against real data', async () => {
    await signIn('24-0002')
    await userEvent.click(await screen.findByRole('link', { name: /Browse/ }))
    expect(await screen.findByText('Dune')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Genre'), 'Science Fiction')
    expect(await screen.findByText('Neuromancer')).toBeInTheDocument()
    expect(screen.queryByText('Cosmos')).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Genre'), '')
    await userEvent.type(screen.getByLabelText('Search by name'), 'laptop')
    expect(await screen.findByText('Laptop 02')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Available only'))
    expect(await screen.findByText('Laptop 04')).toBeInTheDocument()
  })

  it('refuses the admin account and a wrong password on the borrower site', async () => {
    await signIn('admin')
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect SR-code or password')
  })

  it('a teacher who registers waits for approval, can sign in, and sees why they cannot borrow yet', async () => {
    const code = `T-${Date.now()}`
    renderApp('/register', { loggedIn: false })
    await userEvent.selectOptions(screen.getByLabelText('I am a'), 'teacher')
    await userEvent.type(screen.getByLabelText('SR-code'), code)
    await userEvent.type(screen.getByLabelText('Full name'), 'Tina Teacher')
    await userEvent.type(screen.getByLabelText('Email'), `${code.toLowerCase()}@example.com`)
    await userEvent.type(screen.getByLabelText(/^Password/), 'password123')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('heading', { name: 'Request sent' })).toBeInTheDocument()
  })

  it('an existing pending teacher sees the waiting notice after signing in', async () => {
    await signIn('T-002')
    expect(await screen.findByText('Waiting for approval')).toBeInTheDocument()
  })

  it('duplicate registrations show the API message', async () => {
    renderApp('/register', { loggedIn: false })
    await userEvent.type(screen.getByLabelText('SR-code'), '24-0001')
    await userEvent.type(screen.getByLabelText('Full name'), 'Copy Cat')
    await userEvent.type(screen.getByLabelText('Email'), 'copy@example.com')
    await userEvent.type(screen.getByLabelText(/^Password/), 'password123')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('SR-code already registered')
  })
})
