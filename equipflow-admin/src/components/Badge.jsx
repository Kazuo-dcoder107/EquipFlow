// A small coloured pill. `tone` is ok, info, warning, danger or muted.
export default function Badge({ tone = 'muted', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}
