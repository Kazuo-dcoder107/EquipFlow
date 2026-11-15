import { useState } from 'react'
import Tabs from '../components/Tabs'
import Items from './equipment/Items'
import Categories from './equipment/Categories'
import Genres from './equipment/Genres'

const TABS = [
  { id: 'items', label: 'Items' },
  { id: 'categories', label: 'Categories' },
  { id: 'genres', label: 'Genres' },
]

// Everything about what can be borrowed: the items themselves, the categories (loan length and
// fine per day) and the book genres. Three small tabs on one page.
export default function Equipment() {
  const [tab, setTab] = useState('items')
  return (
    <>
      <h1>Equipment</h1>
      <p className="muted">Add and edit the items people borrow, and the categories and genres that organise them.</p>
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Equipment sections" />
      {tab === 'items' && <Items />}
      {tab === 'categories' && <Categories />}
      {tab === 'genres' && <Genres />}
    </>
  )
}
