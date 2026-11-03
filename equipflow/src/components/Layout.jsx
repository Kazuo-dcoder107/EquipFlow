import { NavLink, Link, Outlet } from 'react-router-dom'
import { useAuth } from '../auth'
import { firstName } from '../utils/format'

const TABS = [
  { to: '/', label: 'Home', icon: '\u{1F3E0}', end: true },
  { to: '/loans', label: 'My loans', icon: '\u{1F4DA}' },
  { to: '/fines', label: 'Fines', icon: '\u{1F3AB}' },
  { to: '/recommended', label: 'For you', icon: '\u2B50' },
  { to: '/browse', label: 'Browse', icon: '\u{1F50D}' },
]

// The frame around every logged-in page: a top bar, the page itself, and a bottom tab bar.
// <Outlet /> is where React Router puts the page that matches the current address.
export default function Layout() {
  const { user } = useAuth()
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">EquipFlow</Link>
        <Link to="/profile" className="profile-link">{firstName(user.full_name)}</Link>
      </header>

      <main className="page">
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Main">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className="tab">
            <span aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
