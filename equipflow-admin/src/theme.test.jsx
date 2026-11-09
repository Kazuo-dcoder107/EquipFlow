import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { THEME_COLORS, ThemeProvider, resolveTheme, useTheme } from './theme'
import { STATS, baseRoutes, mockApi, renderApp } from './test/helpers'

const root = document.documentElement
const metaColor = () => document.querySelector('meta[name="theme-color"]').getAttribute('content')

// A fake "prefers-color-scheme: dark" setting that a test can flip, like a computer changing mode.
function fakeSystemTheme(startsDark) {
  const listeners = new Set()
  const query = { matches: startsDark, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) }
  vi.stubGlobal('matchMedia', () => query)
  return (dark) => { query.matches = dark; listeners.forEach((fn) => fn({ matches: dark })) }
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
    renderProbe()
    expect(state()).toBe('system/light')
    expect(metaColor()).toBe(THEME_COLORS.light)
  })

  it('keeps its choice under its own key, separate from the borrower site', async () => {
    fakeSystemTheme(false)
    renderProbe()
    await userEvent.click(screen.getByText('toggle'))
    expect(localStorage.getItem('equipflow-admin.theme')).toBe('dark')
    expect(localStorage.getItem('equipflow.theme')).toBeNull()
  })

  it('uses the saved choice over the system, and ignores a value it does not recognise', () => {
    fakeSystemTheme(false)
    localStorage.setItem('equipflow-admin.theme', 'dark')
    renderProbe()
    expect(state()).toBe('dark/dark')
  })

  it('follows live system changes only while on "system"', async () => {
    const setSystemDark = fakeSystemTheme(false)
    renderProbe()
    act(() => setSystemDark(true))
    expect(state()).toBe('system/dark')
    await userEvent.click(screen.getByText('light'))
    act(() => setSystemDark(false)); act(() => setSystemDark(true))
    expect(state()).toBe('light/light')
    await userEvent.click(screen.getByText('system'))
    expect(state()).toBe('system/dark')
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

describe('theme button in the side menu', () => {
  it('switches modes and says what it will do', async () => {
    fakeSystemTheme(false)
    mockApi({ ...baseRoutes(), 'GET /api/dashboard/stats': STATS })
    renderApp('/')
    await userEvent.click(await screen.findByRole('button', { name: 'Switch to dark mode' }))
    expect(root.dataset.theme).toBe('dark')
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }))
    expect(root.dataset.theme).toBe('light')
  })
})
