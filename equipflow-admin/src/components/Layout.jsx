import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { APPROVALS_CHANGED } from '../events'
import { useTheme } from '../theme'
import { ApprovalsIcon, DashboardIcon, LogoMark, LogoutIcon, MoonIcon, SunIcon, UsersIcon } from './Icons'

// How many sign-up requests are waiting, for the number next to "Approvals". It reloads when an
// approval is decided (the Approvals page announces that, see events.js).
function usePendingApprovals() {
  const [count, setCount] = useState(0)
  const load = useCallback(() => {
    api.users({ status: 'pending_approval', limit: 1 }).then((result) => setCount(result.total)).catch(() => {})
  }, [])

  useEffect(() => {
    load()
    window.addEventListener(APPROVALS_CHANGED, load)
    return () => window.removeEventListener(APPROVALS_CHANGED, load)
  }, [load])

  return count
}

// The frame around every admin page: a side menu (a top bar on small screens) and the page itself.
// <Outlet /> is where React Router puts the page that matches the current address.
export default function Layout() {
  const { user, logout } = useAuth()
  const { resolved, toggle } = useTheme()
  const pending = usePendingApprovals()

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <LogoMark size={30} />
          <span>EquipFlow <small>Admin</small></span>
        </Link>

        <nav className="nav" aria-label="Main">
          <NavLink to="/" end><DashboardIcon /><span>Dashboard</span></NavLink>
          <NavLink to="/approvals">
            <ApprovalsIcon /><span>Approvals</span>
            {pending > 0 && <span className="count" aria-label={`${pending} waiting`}>{pending}</span>}
          </NavLink>
          <NavLink to="/users"><UsersIcon /><span>Users</span></NavLink>
        </nav>

        <div className="sidebar-footer">
          <p className="signed-in" title={user.sr_code}>{user.full_name}</p>
          <div className="footer-buttons">
            <button type="button" className="icon-btn" onClick={toggle}
              aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              {resolved === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
            <button type="button" className="icon-btn" onClick={logout} aria-label="Sign out">
              <LogoutIcon />
            </button>
          </div>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
