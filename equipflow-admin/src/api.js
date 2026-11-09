// Every call to the EquipFlow API goes through this one file, so the rest of the app never
// deals with URLs, headers or error formats directly.

const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')
const TOKEN_KEY = 'equipflow-admin.token'

// ---- the saved login token (kept in the browser's localStorage) ----
export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

// ---- errors ----
export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status // HTTP status, or 0 when the server could not be reached
  }
}

// The API reports problems as {"detail": "text"} or, for form validation,
// {"detail": [{"msg": "Value error, ..."}]}. Turn both into one sentence.
function errorMessage(body, status) {
  const detail = body && body.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((d) => String(d.msg || '').replace(/^Value error, /, '')).join('. ')
  }
  return `Something went wrong (error ${status})`
}

// Called when the server says our token is no longer valid (the auth context sets this to
// "log the admin out").
let onUnauthorized = () => {}
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

/**
 * Send one request.
 *   params - query string values, e.g. { limit: 20 } (empty values are skipped)
 *   json   - object sent as a JSON body
 *   form   - object sent as a form body (the login endpoint wants this)
 *   auth   - false for calls that must not send the token (login)
 */
async function request(path, { method = 'GET', params, json, form, auth = true } = {}) {
  const url = new URL(BASE_URL + path)
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value)
  })

  const headers = {}
  const token = getToken()
  if (auth && token) headers.Authorization = `Bearer ${token}`

  let body
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(json)
  } else if (form) {
    body = new URLSearchParams(form)
  }

  let response
  try {
    response = await fetch(url, { method, headers, body })
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0)
  }

  let data = null
  try {
    data = await response.json()
  } catch {
    // an empty or non-JSON body is fine
  }

  if (!response.ok) {
    if (response.status === 401 && auth) {
      clearToken()
      onUnauthorized()
    }
    throw new ApiError(errorMessage(data, response.status), response.status)
  }
  return data
}

// ---- the calls the admin site makes ----
export const api = {
  // Admins sign in at their own endpoint; student, teacher and staff accounts are refused there.
  login: (username, password) =>
    request('/api/auth/admin/login', { method: 'POST', form: { username, password }, auth: false }),
  me: () => request('/api/auth/me'),

  dashboard: () => request('/api/dashboard/stats'),

  users: (params) => request('/api/users', { params }),
  approveUser: (id) => request(`/api/users/${id}/approve`, { method: 'POST' }),
  rejectUser: (id, reason) => request(`/api/users/${id}/reject`, { method: 'POST', json: reason ? { reason } : {} }),
  deactivateCard: (id) => request(`/api/users/${id}/deactivate-tag`, { method: 'POST' }),
  reissueCard: (id) => request(`/api/users/${id}/reissue-tag`, { method: 'POST' }),

  departmentsOverview: () => request('/api/departments/overview'),
}
