import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Avatar from './components/Avatar'
import { AuthProvider } from './auth'
import { clearAvatarCache } from './hooks/useAvatar'
import { ThemeProvider } from './theme'
import { STUDENT, blobResponse, jsonResponse, mockApi, renderApp } from './test/helpers'

// The real image resizing needs a browser canvas; here it is replaced by a fake that returns a tiny file.
vi.mock('./utils/image', async (original) => ({
  ...(await original()),
  prepareAvatar: vi.fn(async () => new Blob(['jpeg'], { type: 'image/jpeg' })),
}))
import { prepareAvatar } from './utils/image'

const withPhoto = { ...STUDENT, has_avatar: true, avatar_version: 100 }
const wrap = (ui) => render(<ThemeProvider><AuthProvider>{ui}</AuthProvider></ThemeProvider>)
const callsTo = (fetchMock, method, path) =>
  fetchMock.mock.calls.filter(([url, o]) => (o?.method || 'GET') === method && new URL(url).pathname === path)

describe('Avatar', () => {
  it('shows the first letter of the name when there is no photo', () => {
    mockApi({})
    wrap(<Avatar user={STUDENT} size="lg" />)
    expect(screen.getByText('J')).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
  })

  it('uses a capital even if the name starts in lower case', () => {
    mockApi({})
    wrap(<Avatar user={{ ...STUDENT, full_name: '  maria santos' }} />)
    expect(screen.getByText('M')).toBeInTheDocument()
  })

  it('shows the downloaded photo, using the login token', async () => {
    localStorage.setItem('equipflow.token', 't0k3n')
    URL.createObjectURL = vi.fn(() => 'blob:photo-100')
    const fetchMock = mockApi({ 'GET /api/me/avatar': () => blobResponse() })
    wrap(<Avatar user={withPhoto} />)

    await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('src', 'blob:photo-100'))
    const [url, options] = fetchMock.mock.calls[0]
    expect(new URL(url).searchParams.get('v')).toBe('100')
    expect(options.headers.Authorization).toBe('Bearer t0k3n')
    expect(screen.queryByText('J')).not.toBeInTheDocument()
  })

  it('downloads a photo once, however many places show it', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:shared')
    const fetchMock = mockApi({ 'GET /api/me/avatar': () => blobResponse() })
    wrap(<><Avatar user={withPhoto} size="sm" /><Avatar user={withPhoto} size="lg" /></>)

    await waitFor(() => expect(document.querySelectorAll('img')).toHaveLength(2))
    expect(callsTo(fetchMock, 'GET', '/api/me/avatar')).toHaveLength(1)
  })

  it('falls back to the letter when the download fails or the picture is broken', async () => {
    mockApi({ 'GET /api/me/avatar': () => jsonResponse({ detail: 'No profile photo' }, 404) })
    wrap(<Avatar user={withPhoto} />)
    expect(await screen.findByText('J')).toBeInTheDocument()

    clearAvatarCache()
    URL.createObjectURL = vi.fn(() => 'blob:corrupt')
    mockApi({ 'GET /api/me/avatar': () => blobResponse() })
    wrap(<Avatar user={{ ...withPhoto, id: 2, full_name: 'Zed Zee' }} />)
    const image = await waitFor(() => {
      const found = document.querySelector('img[src="blob:corrupt"]')
      expect(found).not.toBeNull()
      return found
    })
    fireEvent.error(image)
    expect(await screen.findByText('Z')).toBeInTheDocument()
  })

  it('fetches again for a new version and frees the old one afterwards', async () => {
    const urls = ['blob:v1', 'blob:v2']
    URL.createObjectURL = vi.fn(() => urls.shift())
    URL.revokeObjectURL = vi.fn()
    const fetchMock = mockApi({ 'GET /api/me/avatar': () => blobResponse() })

    const { rerender } = wrap(<Avatar user={{ ...withPhoto, avatar_version: 1 }} />)
    await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('src', 'blob:v1'))

    rerender(<ThemeProvider><AuthProvider><Avatar user={{ ...withPhoto, avatar_version: 2 }} /></AuthProvider></ThemeProvider>)
    await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('src', 'blob:v2'))
    expect(callsTo(fetchMock, 'GET', '/api/me/avatar')).toHaveLength(2)
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:v1'))
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:v2')
  })

  it('forgets every downloaded photo on request (used when logging out)', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:mine')
    URL.revokeObjectURL = vi.fn()
    mockApi({ 'GET /api/me/avatar': () => blobResponse() })
    wrap(<Avatar user={withPhoto} />)
    await waitFor(() => expect(document.querySelector('img')).not.toBeNull())

    clearAvatarCache()
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mine'))
  })
})

describe('Home page greeting', () => {
  const home = (me) => ({
    'GET /api/auth/me': me,
    'GET /api/me/summary': { borrowed_now: 0, overdue_now: 0, unpaid_total: 0 },
    'GET /api/me/transactions': { total: 0, items: [] },
    'GET /api/me/recommendations': { strategy: 'popular', borrowing_blocked: null, top_categories: [], top_genres: [], items: [] },
  })

  it('puts the picture to the left of the name', async () => {
    mockApi(home(STUDENT))
    renderApp('/')
    const heading = await screen.findByRole('heading', { name: 'Hello, Juan' })
    const greeting = heading.closest('.greeting')
    expect(greeting.firstElementChild).toHaveClass('avatar-circle')   // first = on the left
    expect(greeting.firstElementChild).toHaveTextContent('J')
    expect(greeting.lastElementChild).toBe(heading)
  })

  it('shows the uploaded photo there, and in the top bar', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:me')
    mockApi({ ...home(withPhoto), 'GET /api/me/avatar': () => blobResponse() })
    renderApp('/')
    const heading = await screen.findByRole('heading', { name: 'Hello, Juan' })
    await waitFor(() => expect(heading.closest('.greeting').querySelector('img')).toHaveAttribute('src', 'blob:me'))
    await waitFor(() => expect(screen.getByRole('link', { name: 'Profile of Juan' }).querySelector('img')).not.toBeNull())
  })
})

describe('Profile photo', () => {
  // each test starts with a picture-preparer that works, and no leftover one-off failures
  beforeEach(() => {
    prepareAvatar.mockReset()
    prepareAvatar.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
  })

  /** An API where /auth/me reflects what has been uploaded or removed so far. */
  function photoApi({ startsWithPhoto = false, putResponse } = {}) {
    let user = startsWithPhoto ? withPhoto : STUDENT
    return mockApi({
      'GET /api/auth/me': () => jsonResponse(user),
      'GET /api/me/avatar': () => blobResponse(),
      'PUT /api/me/avatar': putResponse || (() => { user = { ...withPhoto, avatar_version: 200 }; return jsonResponse(user) }),
      'DELETE /api/me/avatar': () => { user = STUDENT; return jsonResponse(user) },
    })
  }
  const chooseFile = (name = 'me.png', type = 'image/png') =>
    userEvent.upload(screen.getByLabelText('Picture file'), new File(['x'], name, { type }))

  it('offers "Add photo" with the letter avatar when there is no photo', async () => {
    photoApi()
    renderApp('/profile')
    expect(await screen.findByRole('button', { name: 'Add photo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove photo' })).not.toBeInTheDocument()
    expect(document.querySelector('.photo-frame .avatar-circle')).toHaveTextContent('J')
  })

  it('uploads the prepared picture, then switches to Change / Remove', async () => {
    const fetchMock = photoApi()
    renderApp('/profile')
    await screen.findByRole('button', { name: 'Add photo' })
    await chooseFile()

    expect(await screen.findByRole('button', { name: 'Change photo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove photo' })).toBeInTheDocument()
    expect(prepareAvatar).toHaveBeenCalledTimes(1)
    const [put] = callsTo(fetchMock, 'PUT', '/api/me/avatar')
    expect(put[1].body.get('file')).toBeInstanceOf(Blob)
    await waitFor(() => expect(document.querySelector('.photo-frame img')).not.toBeNull())
  })

  it('disables the buttons and says "Saving..." while the upload is running', async () => {
    let finish
    photoApi({ putResponse: () => new Promise((resolve) => { finish = () => resolve(jsonResponse({ ...withPhoto })) }) })
    renderApp('/profile')
    await screen.findByRole('button', { name: 'Add photo' })
    await chooseFile()

    const saving = await screen.findByRole('button', { name: 'Saving...' })
    expect(saving).toBeDisabled()
    finish()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Saving...' })).not.toBeInTheDocument())
  })

  it('removes the photo and goes back to the letter', async () => {
    const fetchMock = photoApi({ startsWithPhoto: true })
    renderApp('/profile')
    await userEvent.click(await screen.findByRole('button', { name: 'Remove photo' }))

    expect(await screen.findByRole('button', { name: 'Add photo' })).toBeInTheDocument()
    expect(callsTo(fetchMock, 'DELETE', '/api/me/avatar')).toHaveLength(1)
    await waitFor(() => expect(document.querySelector('.photo-frame img')).toBeNull())
  })

  it('shows what the server says when it refuses the picture', async () => {
    photoApi({ putResponse: () => jsonResponse({ detail: 'That file is not a valid picture.' }, 422) })
    renderApp('/profile')
    await screen.findByRole('button', { name: 'Add photo' })
    await chooseFile()

    expect(await screen.findByRole('alert')).toHaveTextContent('That file is not a valid picture.')
    expect(screen.getByRole('button', { name: 'Add photo' })).toBeEnabled()
  })

  it('shows the message when the picture cannot be prepared, without calling the server', async () => {
    const fetchMock = photoApi()
    prepareAvatar.mockRejectedValueOnce(new Error('Please choose a JPG, PNG or WebP picture.'))
    renderApp('/profile')
    await screen.findByRole('button', { name: 'Add photo' })
    await chooseFile()

    expect(await screen.findByRole('alert')).toHaveTextContent('JPG, PNG or WebP')
    expect(callsTo(fetchMock, 'PUT', '/api/me/avatar')).toHaveLength(0)
  })

  it('clears an old error when the next attempt starts', async () => {
    photoApi()
    prepareAvatar.mockRejectedValueOnce(new Error('first problem'))
    renderApp('/profile')
    await screen.findByRole('button', { name: 'Add photo' })
    await chooseFile()
    expect(await screen.findByRole('alert')).toHaveTextContent('first problem')

    await chooseFile()
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})
