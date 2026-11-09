import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useApi } from '../hooks/useApi'
import { useDebounce } from '../hooks/useDebounce'
import { ROLE_LABELS, STATUS_LABELS, YEAR_LABELS, cardStatus } from '../utils/format'
import Avatar from '../components/Avatar'
import Badge from '../components/Badge'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import ErrorBox from '../components/ErrorBox'
import Loading from '../components/Loading'

const PAGE_SIZE = 25
const STATUS_TONES = { active: 'ok', pending_approval: 'warning', pending_enrollment: 'info' }

// What each card action does, in words the admin sees before confirming.
const CARD_ACTIONS = {
  deactivate: {
    title: (name) => `Deactivate ${name}'s card?`,
    confirm: 'Deactivate card',
    text: (name) => `The card stops working at once, for example because it was lost. ${name} keeps their account and borrowing history. Use "Reissue card" when they have a replacement.`,
    done: (name) => `Deactivated ${name}'s card.`,
    run: (id) => api.deactivateCard(id),
  },
  reissue: {
    title: (name) => `Reissue ${name}'s card?`,
    confirm: 'Reissue card',
    text: (name) => `The old card is unlinked for good, and ${name} must tap the new card at the kiosk to link it. Their borrowing history and open loans are kept.`,
    done: (name) => `${name}'s card was unlinked. They can link a new card at the kiosk.`,
    run: (id) => api.reissueCard(id),
  },
}

// Everyone with an account. Browse by department and program with the chips, narrow down with
// the search box and the other filters, and handle lost ID cards.
export default function Users() {
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [yearLevel, setYearLevel] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [programId, setProgramId] = useState('')
  const [page, setPage] = useState(0)

  const [action, setAction] = useState(null) // { kind: 'deactivate' | 'reissue', person }
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [message, setMessage] = useState('')

  const debouncedSearch = useDebounce(search) // wait until typing pauses

  const overview = useApi(() => api.departmentsOverview(), [])
  const list = useApi(
    () => api.users({
      search: debouncedSearch.trim(), role, status, year_level: yearLevel,
      department_id: departmentId, program_id: programId, limit: PAGE_SIZE, offset: page * PAGE_SIZE,
    }),
    [debouncedSearch, role, status, yearLevel, departmentId, programId, page],
  )

  // Changing any filter starts again from the first page.
  const filter = (setter) => (value) => { setter(value); setPage(0) }
  const chooseDepartment = (id) => { setDepartmentId(id); setProgramId(''); setPage(0) } // programs belong to one department
  const chooseRole = (value) => {
    setRole(value)
    if (value && value !== 'student') setYearLevel('') // only students have a year level
    setPage(0)
  }

  const department = overview.data?.find((d) => String(d.id) === String(departmentId))
  const yearApplies = !role || role === 'student'
  const items = list.data?.items || []
  const total = list.data?.total || 0

  function ask(kind, person) {
    setActionError('')
    setAction({ kind, person })
  }

  async function confirm() {
    const { kind, person } = action
    setBusy(true)
    setActionError('')
    try {
      await CARD_ACTIONS[kind].run(person.id)
      setMessage(CARD_ACTIONS[kind].done(person.full_name))
      setAction(null)
      list.reload()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h1>Users</h1>

      <section aria-label="Browse by department">
        {overview.error && <ErrorBox message={overview.error} onRetry={overview.reload} />}
        {overview.data && (
          <>
            <div className="chips" role="group" aria-label="Department">
              <button type="button" className="chip-btn" aria-pressed={departmentId === ''} onClick={() => chooseDepartment('')}>
                All departments
              </button>
              {overview.data.map((d) => (
                <button key={d.id} type="button" className="chip-btn" aria-pressed={String(d.id) === String(departmentId)} onClick={() => chooseDepartment(String(d.id))}>
                  {d.name} <span className="chip-count">{d.members}</span>
                </button>
              ))}
            </div>
            {department && department.programs.length > 0 && (
              <div className="chips chips-sub" role="group" aria-label="Program">
                <button type="button" className="chip-btn" aria-pressed={programId === ''} onClick={() => filter(setProgramId)('')}>
                  All programs
                </button>
                {department.programs.map((p) => (
                  <button key={p.id} type="button" className="chip-btn" aria-pressed={String(p.id) === String(programId)} onClick={() => filter(setProgramId)(String(p.id))}>
                    {p.name} <span className="chip-count">{p.students}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <div className="filters">
        <input type="search" placeholder="Search name, SR-code or email" aria-label="Search" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }} />
        <select aria-label="Role" value={role} onChange={(e) => chooseRole(e.target.value)}>
          <option value="">All roles</option>
          {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select aria-label="Status" value={status} onChange={(e) => filter(setStatus)(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select aria-label="Year level" value={yearLevel} onChange={(e) => filter(setYearLevel)(e.target.value)} disabled={!yearApplies}
          title={yearApplies ? undefined : 'Year level is for students only'}>
          <option value="">{yearApplies ? 'All year levels' : 'Students only'}</option>
          {Object.entries(YEAR_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {message && <p className="notice notice-ok" role="status">{message}</p>}
      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {list.loading && items.length === 0 && <Loading />}
      {list.data && items.length === 0 && <EmptyState title="No users found">Try a different search or clear a filter.</EmptyState>}

      {items.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Users</caption>
            <thead>
              <tr><th>Person</th><th>Status</th><th>Department</th><th>ID card</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {items.map((person) => {
                const card = cardStatus(person)
                return (
                  <tr key={person.id}>
                    <td data-label="Person" className="person-cell">
                      <div className="person">
                        <Avatar name={person.full_name} />
                        <div>
                          <strong>{person.full_name}</strong>
                          <span className="muted small block">{ROLE_LABELS[person.role] || person.role} &middot; {person.sr_code}</span>
                          <span className="muted small block">{person.email}</span>
                        </div>
                      </div>
                    </td>
                    <td data-label="Status"><Badge tone={STATUS_TONES[person.status] || 'muted'}>{STATUS_LABELS[person.status] || person.status}</Badge></td>
                    <td data-label="Department">
                      {/* one wrapper, so a card layout treats the whole answer as a single item */}
                      <div>
                        {person.department ? (
                          <>
                            {person.department}
                            {person.program && <span className="muted small block">{person.program}{person.year_level ? `, ${YEAR_LABELS[person.year_level]}` : ''}</span>}
                          </>
                        ) : <span className="muted">-</span>}
                      </div>
                    </td>
                    <td data-label="ID card">{person.role === 'admin' ? <span className="muted">-</span> : <Badge tone={card.tone}>{card.label}</Badge>}</td>
                    <td data-label="Actions" className="actions">
                      <div className="row-actions">
                        {person.status === 'pending_approval' && <Link to="/approvals" className="btn btn-small">Review</Link>}
                        {person.role !== 'admin' && person.rfid_linked && person.rfid_active && (
                          <button type="button" className="btn btn-small btn-danger" onClick={() => ask('deactivate', person)}>Deactivate card</button>
                        )}
                        {person.role !== 'admin' && person.rfid_linked && (
                          <button type="button" className="btn btn-small" onClick={() => ask('reissue', person)}>Reissue card</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > PAGE_SIZE && (
        <nav className="pager" aria-label="Pages">
          <button type="button" className="btn btn-small" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="muted small">
            Showing {page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <button type="button" className="btn btn-small" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(page + 1)}>Next</button>
        </nav>
      )}

      {action && (
        <ConfirmDialog
          title={CARD_ACTIONS[action.kind].title(action.person.full_name)}
          confirmLabel={CARD_ACTIONS[action.kind].confirm}
          danger={action.kind === 'deactivate'}
          busy={busy}
          error={actionError}
          onConfirm={confirm}
          onCancel={() => setAction(null)}
        >
          <p>{CARD_ACTIONS[action.kind].text(action.person.full_name)}</p>
        </ConfirmDialog>
      )}
    </>
  )
}
