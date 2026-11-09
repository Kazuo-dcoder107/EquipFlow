import { useEffect, useState } from 'react'

/**
 * Load data when a component appears (and again when `deps` change).
 *
 *   const { data, loading, error, reload } = useApi(() => api.summary(), [])
 *
 * `fetcher` is a function that returns a promise. `deps` is the list of values that,
 * when they change, trigger a new load (just like the dependency list of useEffect).
 */
export function useApi(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    let ignore = false // set to true if the component goes away or a newer load starts
    setState((previous) => ({ ...previous, loading: true, error: null }))
    fetcher()
      .then((data) => {
        if (!ignore) setState({ data, loading: false, error: null })
      })
      .catch((err) => {
        if (!ignore) setState({ data: null, loading: false, error: err.message })
      })
    return () => {
      ignore = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadCount])

  return { ...state, reload: () => setReloadCount((n) => n + 1) }
}
