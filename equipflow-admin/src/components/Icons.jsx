// Small line icons drawn inline, so the site needs no icon library and they take the colour
// of the surrounding text (stroke="currentColor").
function Icon({ children, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

export const DashboardIcon = (p) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="7" height="8" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
    <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
    <rect x="3.5" y="14.5" width="7" height="6" rx="1.5" />
  </Icon>
)

export const ApprovalsIcon = (p) => (
  <Icon {...p}>
    <path d="M8 4h8l3 3v13H5V4z" />
    <path d="m9 13 2.2 2.2L15.5 11" />
  </Icon>
)

export const UsersIcon = (p) => (
  <Icon {...p}>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3.5 19.5c.4-3 2.6-4.8 5.5-4.8s5.1 1.8 5.5 4.8" />
    <path d="M16 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14.9c1.8.5 3 2 3.3 4.6" />
  </Icon>
)

export const SunIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
  </Icon>
)

export const MoonIcon = (p) => (
  <Icon {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </Icon>
)

export const LogoutIcon = (p) => (
  <Icon {...p}>
    <path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10" />
    <path d="M15 8l4 4-4 4M19 12H9" />
  </Icon>
)

// The EquipFlow mark: three stacked bars on a solid tile (colours come from CSS).
export function LogoMark({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect className="logo-tile" width="64" height="64" rx="15" />
      <path className="logo-bars" d="M18 22h28v6H18zM18 32h28v6H18zM18 42h18v6H18z" />
    </svg>
  )
}
