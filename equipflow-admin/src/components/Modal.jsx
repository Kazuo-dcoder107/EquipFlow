import { useEffect, useRef } from 'react'

/**
 * A pop-up dialog over a dimmed page. Escape or a click outside closes it, and focus goes to
 * the first element marked data-autofocus (or the first control), then returns to where it was.
 */
export default function Modal({ title, onClose, children }) {
  const box = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose // always the latest onClose, without re-running the effect below

  useEffect(() => {
    const before = document.activeElement
    const first = box.current.querySelector('[data-autofocus]') || box.current.querySelector('textarea, input, select, button')
    first?.focus()
    const onKey = (event) => { if (event.key === 'Escape') closeRef.current() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      before?.focus?.()
    }
  }, [])

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeRef.current()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={box}>
        <h2 id="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  )
}
