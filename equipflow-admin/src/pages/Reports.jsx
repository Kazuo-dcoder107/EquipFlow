import { useState } from 'react'
import Tabs from '../components/Tabs'
import Usage from './reports/Usage'
import FinesPaid from './reports/FinesPaid'

const TABS = [
  { id: 'usage', label: 'Usage' },
  { id: 'fines', label: 'Fines paid' },
]

// Two reports: what was borrowed, and who paid their fines and when. Each can be downloaded as a
// CSV file, or printed / saved as a PDF with the print button.
export default function Reports() {
  const [tab, setTab] = useState('usage')
  return (
    <>
      <h1>Reports</h1>
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Reports" />
      {tab === 'usage' && <Usage />}
      {tab === 'fines' && <FinesPaid />}
    </>
  )
}
