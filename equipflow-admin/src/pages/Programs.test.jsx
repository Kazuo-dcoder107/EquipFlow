import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OVERVIEW, baseRoutes, jsonResponse, mockApi, renderApp } from '../test/helpers'

// The demo overview, plus one program nobody uses (in CET, which has none).
const DATA = OVERVIEW.map((d) => (d.id === 3 ? { ...d, programs: [{ id: 9, name: 'Bachelor of Industrial Technology', students: 0 }] } : d))

const asks = (fetchMock, method, path) => fetchMock.mock.calls.filter(([url, o]) => (o?.method || 'GET') === method && new URL(url).pathname === path)
const bodyOf = (call) => JSON.parse(call[1].body)
const queryOf = (call) => Object.fromEntries(new URL(call[0]).searchParams)

const programsApi = (extra = {}) => mockApi({ ...baseRoutes(), 'GET /api/departments/overview': DATA, ...extra })

describe('Programs', () => {
  it('lists each department with its programs and student counts', async () => {
    programsApi()
    renderApp('/programs')
    const cics = await screen.findByRole('region', { name: 'CICS' })
    expect(cics).toHaveTextContent('Bachelor of Science in Information Technology')
    expect(cics).toHaveTextContent('7 students')
    expect(within(screen.getByRole('region', { name: 'CAFAD' })).getByText('3 students')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'General Service' })).toHaveTextContent('No programs yet.')
  })

  it('adds a program to a department', async () => {
    const fetchMock = programsApi({ 'POST /api/programs': () => jsonResponse({ id: 20, name: 'BS Data Science', department_id: 1 }, 201) })
    renderApp('/programs')
    await userEvent.click(await screen.findByRole('button', { name: 'Add program to CICS' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.type(dialog.getByLabelText('Program name'), '  BS Data Science ')
    await userEvent.click(dialog.getByRole('button', { name: 'Add program' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Added BS Data Science to CICS.')
    expect(bodyOf(asks(fetchMock, 'POST', '/api/programs')[0])).toEqual({ department_id: 1, name: 'BS Data Science' })
  })

  it('shows the server\'s message for a duplicate name and keeps the dialog open', async () => {
    programsApi({ 'POST /api/programs': () => jsonResponse({ detail: '"Bachelor of Science in Information Technology" already exists in this department' }, 409) })
    renderApp('/programs')
    await userEvent.click(await screen.findByRole('button', { name: 'Add program to CICS' }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.type(dialog.getByLabelText('Program name'), 'bachelor of science in information technology')
    await userEvent.click(dialog.getByRole('button', { name: 'Add program' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent('already exists in this department')
  })

  it('renames a program, starting from its current name', async () => {
    const fetchMock = programsApi({ 'PATCH /api/programs/3': () => jsonResponse({ id: 3, name: 'BS Architecture', department_id: 2 }) })
    renderApp('/programs')
    await userEvent.click(await screen.findByRole('button', { name: 'Rename Bachelor of Science in Architecture' }))
    const field = within(screen.getByRole('dialog')).getByLabelText('Program name')
    expect(field).toHaveValue('Bachelor of Science in Architecture')
    await userEvent.clear(field)
    await userEvent.type(field, 'BS Architecture')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Renamed to BS Architecture.')
    expect(bodyOf(asks(fetchMock, 'PATCH', '/api/programs/3')[0])).toEqual({ name: 'BS Architecture' })
  })

  it('deletes a program nobody uses without asking where students go', async () => {
    const fetchMock = programsApi({ 'DELETE /api/programs/9': { ok: true, students_moved: 0 } })
    renderApp('/programs')
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Bachelor of Industrial Technology' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('No students use this program.')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete program' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Deleted Bachelor of Industrial Technology.')
    expect(queryOf(asks(fetchMock, 'DELETE', '/api/programs/9')[0])).toEqual({})
  })

  it('makes you choose where students move before deleting a program they use', async () => {
    const fetchMock = programsApi({ 'DELETE /api/programs/1': { ok: true, students_moved: 7 } })
    renderApp('/programs')
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Bachelor of Science in Information Technology' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(screen.getByRole('dialog')).toHaveTextContent('7 student(s) use this program')
    expect(dialog.queryByRole('option', { name: /Information Technology/ })).not.toBeInTheDocument() // cannot move to itself

    await userEvent.click(dialog.getByRole('button', { name: 'Delete program' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent('Choose the program these students move to.')
    expect(asks(fetchMock, 'DELETE', '/api/programs/1')).toHaveLength(0)

    await userEvent.selectOptions(dialog.getByLabelText('Move students to'), '4')
    await userEvent.click(dialog.getByRole('button', { name: 'Delete program' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Deleted Bachelor of Science in Information Technology.')
    expect(queryOf(asks(fetchMock, 'DELETE', '/api/programs/1')[0])).toEqual({ reassign_to: '4' })
  })
})
