export default function Loading({ text = 'Loading...' }) {
  return (
    <p className="loading" role="status">
      {text}
    </p>
  )
}
