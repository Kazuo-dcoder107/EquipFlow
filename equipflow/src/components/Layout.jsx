import { NavLink, Link, Outlet } from 'react-router-dom'
import { useAuth } from '../auth'
import { useTheme } from '../theme'
import { firstName } from '../utils/format'
import Avatar from './Avatar'
import { BooksIcon, HomeIcon, LogoMark, MoonIcon, SearchIcon, SparkIcon, SunIcon, TicketIcon } from './Icons'

const TABS = [
  { to: '/', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/loans', label: 'My loans', Icon: BooksIcon },
  { to: '/fines', label: 'Fines', Icon: TicketIcon },
  { to: '/recommended', label: 'For you', Icon: SparkIcon },
  { to: '/browse', label: 'Browse', Icon: SearchIcon },
]

// The frame around every logged-in page: a top bar, the page itself, and a bottom tab bar.
// <Outlet /> is where React Router puts the page that matches the current address.
export default function Layout() {
  const { user } = useAuth()
  const { resolved, toggle } = useTheme()
  const name = firstName(user.full_name)

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <LogoMark size={28} />
          EquipFlow
        </Link>

        <div className="topbar-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={toggle}
            aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {resolved === 'dark' ? <SunIcon size={20} /> : <MoonIcon size={20} />}
          </button>
          <Link to="/profile" className="avatar-link" aria-label={`Profile of ${name}`}>
            <Avatar size="sm" />
          </Link>
        </div>
      </header>

      <main className="page">
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Main">
        {TABS.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="tab">
            <span className="tab-icon">
              <Icon />
            </span>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
