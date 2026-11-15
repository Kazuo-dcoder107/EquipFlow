// "Previous / Showing 1-25 of 60 / Next". Shown only when there is more than one page.
export default function Pager({ page, size, total, onChange }) {
  if (total <= size) return null
  return (
    <nav className="pager" aria-label="Pages">
      <button type="button" className="btn btn-small" disabled={page === 0} onClick={() => onChange(page - 1)}>Previous</button>
      <span className="muted small">Showing {page * size + 1}&ndash;{Math.min((page + 1) * size, total)} of {total}</span>
      <button type="button" className="btn btn-small" disabled={(page + 1) * size >= total} onClick={() => onChange(page + 1)}>Next</button>
    </nav>
  )
}
