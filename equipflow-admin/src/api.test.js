import { describe, expect, it, vi } from 'vitest'
import { ApiError, api, getToken, setToken, setUnauthorizedHandler } from './api'
import { jsonResponse, mockApi } from './test/helpers'

describe('api requests', () => {
  it('signs in at the ADMIN endpoint with a form body and no token', async () => {
    setToken('old')
    const fetchMock = mockApi({ 'POST /api/auth/admin/login': { access_token: 't', role: 'admin', full_name: 'A' } })
    await api.login('admin', 'secret123')

    const [url, options] = fetchMock.mock.calls[0]
    expect(new URL(url).pathname).toBe('/api/auth/admin/login')
    expect(options.body.toString()).toBe('username=admin&password=secret123')
    expect(options.headers.Authorization).toBeUndefined()
  })

  it('keeps its login under its own storage key, apart from the borrower site', () => {
    setToken('abc')
    expect(localStorage.getItem('equipflow-admin.token')).toBe('abc')
    expect(localStorage.getItem('equipflow.token')).toBeNull()
  })

  it('sends the token and builds the query string, skipping empty values', async () => {
    setToken('abc')
    const fetchMock = mockApi({ 'GET /api/users': { total: 0, items: [] } })
    await api.users({ search: 'ana', role: '', department_id: 4, year_level: undefined, limit: 25, offset: 0 })

    const [url, options] = fetchMock.mock.calls[0]
    expect(new URL(url).search).toBe('?search=ana&department_id=4&limit=25&offset=0')
    expect(options.headers.Authorization).toBe('Bearer abc')
  })

  it('approves, rejects (with or without a reason) and handles ID cards with POST', async () => {
    const fetchMock = mockApi({
      'POST /api/users/7/approve': { id: 7 },
      'POST /api/users/7/reject': { ok: true, emailed: false },
      'POST /api/users/7/deactivate-tag': { id: 7 },
      'POST /api/users/7/reissue-tag': { id: 7 },
    })
    await api.approveUser(7)
    await api.rejectUser(7, 'Could not verify you')
    await api.rejectUser(7, '')
    await api.deactivateCard(7)
    await api.reissueCard(7)

    const sent = fetchMock.mock.calls.map(([url, o]) => `${o.method} ${new URL(url).pathname} ${o.body ?? ''}`)
    expect(sent).toEqual([
      'POST /api/users/7/approve ',
      'POST /api/users/7/reject {"reason":"Could not verify you"}',
      'POST /api/users/7/reject {}',
      'POST /api/users/7/deactivate-tag ',
      'POST /api/users/7/reissue-tag ',
    ])
  })
})

describe('api errors', () => {
  it('uses the API text for plain errors', async () => {
    mockApi({ 'POST /api/auth/admin/login': () => jsonResponse({ detail: 'Incorrect username or password' }, 401) })
    await expect(api.login('x', 'y')).rejects.toMatchObject({ message: 'Incorrect username or password', status: 401 })
  })

  it('joins validation errors into one readable message', async () => {
    mockApi({ 'GET /api/users': () => jsonResponse({ detail: [{ msg: 'Value error, bad limit' }, { msg: 'second problem' }] }, 422) })
    await expect(api.users({})).rejects.toThrow('bad limit. second problem')
  })

  it('explains when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const error = await api.me().catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(0)
    expect(error.message).toMatch(/Cannot reach the server/)
  })

  it('clears the token and calls the handler on a 401 for a signed-in call', async () => {
    setToken('expired')
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    mockApi({ 'GET /api/dashboard/stats': () => jsonResponse({ detail: 'Not authenticated' }, 401) })

    await expect(api.dashboard()).rejects.toThrow('Not authenticated')
    expect(getToken()).toBeNull()
    expect(handler).toHaveBeenCalledTimes(1)
    setUnauthorizedHandler(() => {})
  })

  it('does not treat a wrong password as an expired session', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    mockApi({ 'POST /api/auth/admin/login': () => jsonResponse({ detail: 'Incorrect username or password' }, 401) })
    await expect(api.login('a', 'b')).rejects.toThrow()
    expect(handler).not.toHaveBeenCalled()
    setUnauthorizedHandler(() => {})
  })
})
