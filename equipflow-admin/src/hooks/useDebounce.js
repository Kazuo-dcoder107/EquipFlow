import { useEffect, useState } from 'react'

// Returns `value`, but only after it has stopped changing for `delay` milliseconds.
// Used by the search box so we do not call the API on every single keystroke.
export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
