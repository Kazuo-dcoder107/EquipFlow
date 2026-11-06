import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { THEME_COLORS, ThemeProvider, resolveTheme, useTheme } from './theme'
import { DEPARTMENTS, STUDENT, mockApi, renderApp } from './test/helpers'

const root = document.documentElement
const metaColor = () => document.querySelector('meta[name="theme-color"]').getAttribute('content')

// A fake "prefers-color-scheme: dark" setting that a test can flip, like a phone changing mode.
function fakeSystemTheme(startsDark) {
  const listeners = new Set()
  const query = {
    matches: startsDark,
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  }
  vi.stubGlobal('matchMedia', () => query)
  return (dark) => {
    query.matches = dark
    listeners.forEach((fn) => fn({ matches: dark }))
  }
}

function Probe() {
  const { preference, resolved, setPreference, toggle } = useTheme()
  return (
    <>
      <p data-testid="state">{`${preference}/${resolved}`}</p>
      <button onClick={() => setPreference('light')}>light</button>
      <button onClick={() => setPreference('system')}>system</button>
      <button onClick={toggle}>toggle</button>
    </>
  )
}
const renderProbe = () => render(<ThemeProvider><Probe /></ThemeProvider>)
const state = () => screen.getByTestId('state').textContent

beforeEach(() => {
  document.head.insertAdjacentHTML('beforeend', '<meta name="theme-color" content="#000000">')
  return () => document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove())
})

describe('resolveTheme', () => {
  it('follows the system only when the preference is "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('ThemeProvider', () => {
  it('defaults to the system setting and applies it to the page and the address bar', () => {
    fakeSystemTheme(true)
    renderProbe()
    expect(state()).toBe('system/dark')
    expect(root.dataset.theme).toBe('dark')
    expect(root.style.colorScheme).toBe('dark')
    expect(metaColor()).toBe(THEME_COLORS.dark)
  })

  it('stays light when the browser cannot report a system theme', () => {
    renderProbe() // jsdom has no matchMedia
    expect(state()).toBe('system/light')
    expect(root.dataset.theme).toBe('light')
    expect(metaColor()).toBe(THEME_COLORS.light)
  })

  it('uses the saved choice over the system setting', () => {
    fakeSystemTheme(false)
    localStorage.setItem('equipflow.theme', 'dark')
    renderProbe()
    expect(state()).toBe('dark/dark')
  })

  it('ignores a saved value it does not recognise', () => {
    fakeSystemTheme(true)
    localStorage.setItem('equipflow.theme', 'purple')
    renderProbe()
    expect(state()).toBe('system/dark')
  })

  it('follows live system changes only while on "system"', async () => {
    const setSystemDark = fakeSystemTheme(false)
    renderProbe()
    act(() => setSystemDark(true))
    expect(state()).toBe('system/dark')

    await userEvent.click(screen.getByText('light'))
    act(() => setSystemDark(false))
    act(() => setSystemDark(true))
    expect(state()).toBe('light/light') // an explicit choice is not overridden

    await userEvent.click(screen.getByText('system'))
    expect(state()).toBe('system/dark') // back to following the phone
  })

  it('saves a choice on the device, and the toggle flips light and dark', async () => {
    fakeSystemTheme(false)
    renderProbe()
    await userEvent.click(screen.getByText('toggle'))
    expect(state()).toBe('dark/dark')
    expect(localStorage.getItem('equipflow.theme')).toBe('dark')
    expect(metaColor()).toBe(THEME_COLORS.dark)

    await userEvent.click(screen.getByText('toggle'))
    expect(state()).toBe('light/light')
    expect(localStorage.getItem('equipflow.theme')).toBe('light')
  })

  it('still works when the browser blocks storage', async () => {
    fakeSystemTheme(false)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    renderProbe()
    await userEvent.click(screen.getByText('toggle'))
    expect(state()).toBe('dark/dark')
    vi.restoreAllMocks()
  })
})

describe('theme controls in the app', () => {
  const home = {
    'GET /api/auth/me': STUDENT,
    'GET /api/departments': DEPARTMENTS,
    'GET /api/me/summary': { borrowed_now: 0, overdue_now: 0, unpaid_total: 0 },
    'GET /api/me/transactions': { total: 0, items: [] },
    'GET /api/me/recommendations': { strategy: 'popular', borrowing_blocked: null, top_categories: [], top_genres: [], items: [] },
  }

  it('the top-bar button switches modes and says what it will do', async () => {
    fakeSystemTheme(false)
    mockApi(home)
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Switch to dark mode' }))
    expect(root.dataset.theme).toBe('dark')
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }))
    expect(root.dataset.theme).toBe('light')
  })

  it('the Profile page offers System, Light and Dark, and remembers the choice', async () => {
    fakeSystemTheme(false)
    mockApi(home)
    renderApp('/profile')
    expect(await screen.findByRole('radio', { name: 'System' })).toBeChecked()

    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(root.dataset.theme).toBe('dark')
    expect(localStorage.getItem('equipflow.theme')).toBe('dark')

    await userEvent.click(screen.getByRole('radio', { name: 'System' }))
    expect(root.dataset.theme).toBe('light') // the fake phone is in light mode
  })

  it('shows the first letter of the name on the profile button', async () => {
    mockApi(home)
    renderApp('/')
    expect(await screen.findByRole('link', { name: 'Profile of Juan' })).toHaveTextContent('J')
  })
})
