import { useState } from 'react'
import Tabs from '../components/Tabs'
import Loans from './transactions/Loans'
import Fines from './transactions/Fines'

const TABS = [
  { id: 'loans', label: 'Loans' },
  { id: 'fines', label: 'Fines' },
]

// Borrowing history and the money side of it: who has what, and which fines are paid or waived.
export default function Transactions() {
  const [tab, setTab] = useState('loans')
  return (
    <>
      <h1>Loans and fines</h1>
      <p className="muted">See who borrowed what, record lost or damaged items, and settle fines.</p>
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Loans and fines sections" />
      {tab === 'loans' && <Loans />}
      {tab === 'fines' && <Fines />}
    </>
  )
}
