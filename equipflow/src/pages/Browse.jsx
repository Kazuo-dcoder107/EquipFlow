import { useState } from 'react'
import { api } from '../api'
import { useApi } from '../hooks/useApi'
import { useDebounce } from '../hooks/useDebounce'
import EmptyState from '../components/EmptyState'
import ErrorBox from '../components/ErrorBox'
import ItemCard from '../components/ItemCard'
import Loading from '../components/Loading'

const PAGE_SIZE = 20

export default function Browse() {
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [genreId, setGenreId] = useState('')
  const [availableOnly, setAvailableOnly] = useState(false)
  const [limit, setLimit] = useState(PAGE_SIZE)

  const debouncedSearch = useDebounce(search) // wait until typing pauses

  const categories = useApi(() => api.categories(), [])
  const genres = useApi(() => api.genres(), [])
  const results = useApi(
    () => api.equipment({
      search: debouncedSearch.trim(),
      category_id: categoryId,
      genre_id: genreId,
      status: availableOnly ? 'available' : '',
      limit,
    }),
    [debouncedSearch, categoryId, genreId, availableOnly, limit],
  )

  // Changing a filter starts again from the first page.
  const onFilter = (setter) => (event) => {
    setter(event.target.type === 'checkbox' ? event.target.checked : event.target.value)
    setLimit(PAGE_SIZE)
  }

  // Genres belong to books only. When a hardware category (Laptop, Arduino Kit, Projector...)
  // is chosen, the genre filter is switched off. "All categories" keeps it on.
  const category = categories.data?.find((c) => String(c.id) === categoryId)
  const genresApply = !category || category.type === 'book'

  function onCategory(event) {
    const chosen = categories.data?.find((c) => String(c.id) === event.target.value)
    setCategoryId(event.target.value)
    if (chosen && chosen.type !== 'book') setGenreId('') // forget a genre that no longer applies
    setLimit(PAGE_SIZE)
  }

  const items = results.data?.items || []

  return (
    <>
      <h1>Browse</h1>

      <div className="filters">
        <input
          type="search"
          placeholder="Search by name"
          aria-label="Search by name"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setLimit(PAGE_SIZE) }}
        />
        <div className="filter-row">
          <select aria-label="Category" value={categoryId} onChange={onCategory}>
            <option value="">All categories</option>
            {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select
            aria-label="Genre"
            value={genreId}
            onChange={onFilter(setGenreId)}
            disabled={!genresApply}
            title={genresApply ? undefined : 'Genres only apply to books'}
          >
            <option value="">{genresApply ? 'All genres' : 'Books only'}</option>
            {genres.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <label className="check">
          <input type="checkbox" checked={availableOnly} onChange={onFilter(setAvailableOnly)} />
          Available only
        </label>
      </div>

      {results.error && <ErrorBox message={results.error} onRetry={results.reload} />}
      {results.loading && items.length === 0 && <Loading />}

      {results.data && items.length === 0 && <EmptyState title="Nothing found">Try a different search or clear a filter.</EmptyState>}
      {items.map((item) => <ItemCard key={item.id} item={item} />)}

      {results.data && items.length < results.data.total && (
        <button className="btn" onClick={() => setLimit(limit + PAGE_SIZE)}>
          Show more ({items.length} of {results.data.total})
        </button>
      )}
      <p className="muted small center">To borrow, tap your ID at the kiosk, then scan the item.</p>
    </>
  )
}
