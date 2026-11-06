// Every call to the EquipFlow API goes through this one file, so the rest of the app
// never deals with URLs, headers or error formats directly.

const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')
const TOKEN_KEY = 'equipflow.token'

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
// {"detail": [{"msg": "Value error, Password must be ..."}]}. Turn both into one sentence.
function errorMessage(body, status) {
  const detail = body && body.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((d) => String(d.msg || '').replace(/^Value error, /, '')).join('. ')
  }
  return `Something went wrong (error ${status})`
}

// Called when the server says our token is no longer valid (the auth context sets this
// to "log the user out").
let onUnauthorized = () => {}
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

/**
 * Send one request.
 *   params - query string values, e.g. { limit: 20 } (empty values are skipped)
 *   json   - object sent as a JSON body
 *   form   - object sent as a form body (the login endpoint wants this)
 *   formData - a FormData (used to upload files)
 *   blob   - true when the answer is a picture/file instead of JSON
 *   auth   - false for calls that must not send the token (login, register)
 */
async function request(path, { method = 'GET', params, json, form, formData, blob = false, auth = true } = {}) {
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
    body = new URLSearchParams(form) // the browser sets the form Content-Type itself
  } else if (formData) {
    body = formData // the browser adds the multipart Content-Type (with its boundary)
  }

  let response
  try {
    response = await fetch(url, { method, headers, body })
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0)
  }

  let data = null
  try {
    data = blob && response.ok ? await response.blob() : await response.json()
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

// ---- the calls the app makes ----
export const api = {
  login: (srCode, password) =>
    request('/api/auth/login', { method: 'POST', form: { username: srCode, password }, auth: false }),
  register: (fields) => request('/api/auth/register', { method: 'POST', json: fields, auth: false }),
  me: () => request('/api/auth/me'),

  summary: () => request('/api/me/summary'),
  transactions: (params) => request('/api/me/transactions', { params }),
  penalties: (params) => request('/api/me/penalties', { params }),
  recommendations: (limit = 5) => request('/api/me/recommendations', { params: { limit } }),

  // profile photo: uploaded as a file, downloaded as a picture (needs the login token,
  // so it is fetched here and shown from memory rather than put straight into an <img src>)
  uploadAvatar: (picture) => {
    const formData = new FormData()
    formData.append('file', picture, 'avatar.jpg')
    return request('/api/me/avatar', { method: 'PUT', formData })
  },
  deleteAvatar: () => request('/api/me/avatar', { method: 'DELETE' }),
  avatar: (version) => request('/api/me/avatar', { params: { v: version }, blob: true }),

  // school structure: the departments and their programs (public, the sign-up form needs it)
  departments: () => request('/api/departments', { auth: false }),
  // age, department, and (students only) year level and program
  updateProfile: (fields) => request('/api/me/profile', { method: 'PUT', json: fields }),

  equipment: (params) => request('/api/equipment', { params }),
  categories: () => request('/api/categories'),
  genres: () => request('/api/genres'),
}
