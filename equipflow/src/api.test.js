import { describe, expect, it, vi } from 'vitest'
import { ApiError, api, getToken, setToken, setUnauthorizedHandler } from './api'
import { blobResponse, jsonResponse, mockApi } from './test/helpers'

describe('api requests', () => {
  it('sends the saved token and builds the query string, skipping empty values', async () => {
    setToken('abc')
    const fetchMock = mockApi({ 'GET /api/equipment': { total: 0, items: [] } })
    await api.equipment({ search: 'lap', category_id: '', status: undefined, limit: 20 })

    const [url, options] = fetchMock.mock.calls[0]
    expect(new URL(url).search).toBe('?search=lap&limit=20')
    expect(options.headers.Authorization).toBe('Bearer abc')
  })

  it('logs in with a form body and no token', async () => {
    setToken('old')
    const fetchMock = mockApi({ 'POST /api/auth/login': { access_token: 't', role: 'student', full_name: 'J' } })
    await api.login('24-0001', 'secret123')

    const [, options] = fetchMock.mock.calls[0]
    expect(options.body.toString()).toBe('username=24-0001&password=secret123')
    expect(options.headers.Authorization).toBeUndefined()
  })

  it('sends registration as JSON', async () => {
    const fetchMock = mockApi({ 'POST /api/auth/register': { id: 1, status: 'pending_approval' } })
    await api.register({ sr_code: 'T1', role: 'teacher' })
    const [, options] = fetchMock.mock.calls[0]
    expect(options.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(options.body)).toEqual({ sr_code: 'T1', role: 'teacher' })
  })
})

describe('api errors', () => {
  it('uses the API text for plain errors', async () => {
    mockApi({ 'POST /api/auth/login': () => jsonResponse({ detail: 'Incorrect SR-code or password' }, 401) })
    await expect(api.login('x', 'y')).rejects.toMatchObject({ message: 'Incorrect SR-code or password', status: 401 })
  })

  it('joins validation errors into one readable message', async () => {
    mockApi({
      'POST /api/auth/register': () => jsonResponse({
        detail: [{ msg: 'Value error, Password must be at least 8 characters' }, { msg: 'value is not a valid email address' }],
      }, 422),
    })
    await expect(api.register({})).rejects.toThrow(
      'Password must be at least 8 characters. value is not a valid email address',
    )
  })

  it('explains when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const error = await api.me().catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(0)
    expect(error.message).toMatch(/Cannot reach the server/)
  })

  it('clears the token and calls the handler on a 401 for a logged-in call', async () => {
    setToken('expired')
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    mockApi({ 'GET /api/me/summary': () => jsonResponse({ detail: 'Not authenticated' }, 401) })

    await expect(api.summary()).rejects.toThrow('Not authenticated')
    expect(getToken()).toBeNull()
    expect(handler).toHaveBeenCalledTimes(1)
    setUnauthorizedHandler(() => {})
  })

  it('does not treat a wrong password as an expired session', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    mockApi({ 'POST /api/auth/login': () => jsonResponse({ detail: 'Incorrect SR-code or password' }, 401) })
    await expect(api.login('a', 'b')).rejects.toThrow()
    expect(handler).not.toHaveBeenCalled()
    setUnauthorizedHandler(() => {})
  })
})

describe('profile photo calls', () => {
  it('uploads the picture as multipart form data under the name "file"', async () => {
    setToken('abc')
    const fetchMock = mockApi({ 'PUT /api/me/avatar': { has_avatar: true, avatar_version: 7 } })
    await api.uploadAvatar(new Blob(['jpeg'], { type: 'image/jpeg' }))

    const [, options] = fetchMock.mock.calls[0]
    expect(options.body).toBeInstanceOf(FormData)
    expect(options.body.get('file').name).toBe('avatar.jpg')
    expect(options.headers['Content-Type']).toBeUndefined() // the browser adds it, with the boundary
    expect(options.headers.Authorization).toBe('Bearer abc')
  })

  it('downloads the photo as a Blob, asking for the current version', async () => {
    setToken('abc')
    const fetchMock = mockApi({ 'GET /api/me/avatar': () => blobResponse('pic') })
    const picture = await api.avatar(7)

    expect(picture).toBeInstanceOf(Blob)
    expect(new URL(fetchMock.mock.calls[0][0]).search).toBe('?v=7')
  })

  it('still reads the error message when a picture request fails', async () => {
    setToken('abc')
    mockApi({ 'GET /api/me/avatar': () => jsonResponse({ detail: 'No profile photo' }, 404) })
    await expect(api.avatar(1)).rejects.toMatchObject({ message: 'No profile photo', status: 404 })
  })

  it('deletes with DELETE', async () => {
    const fetchMock = mockApi({ 'DELETE /api/me/avatar': { has_avatar: false } })
    await api.deleteAvatar()
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
  })
})
