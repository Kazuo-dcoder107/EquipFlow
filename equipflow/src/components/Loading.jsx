// Placeholder cards that pulse while data loads. The text is only for screen readers.
export default function Loading({ text = 'Loading...', count = 2 }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{text}</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card skeleton-card" aria-hidden="true">
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-line" />
        </div>
      ))}
    </div>
  )
}
