import { useState } from 'react'
import { api } from '../../api'
import { useApi } from '../../hooks/useApi'
import { CONDITION, TYPE_LABELS } from '../../utils/format'
import { downloadCsv } from '../../utils/csv'
import Badge from '../../components/Badge'
import EmptyState from '../../components/EmptyState'
import ErrorBox from '../../components/ErrorBox'
import Loading from '../../components/Loading'
import PrintMeta from '../../components/PrintMeta'

const REASONS = {
  damaged: 'Damaged', needs_maintenance: 'Needs maintenance', repeated_damage: 'Damaged more than once', heavy_use: 'Heavily used',
}
const percent = (value) => (value === null || value === undefined ? '-' : `${value}%`)
const days = (value) => (value === null || value === undefined ? '-' : `${value} days`)

function Tile({ value, label }) {
  return <div className="tile"><strong>{value}</strong><span>{label}</span></div>
}

// A simple table inside a titled section. `columns` is [{ head, cell }].
function Section({ title, rows, columns, empty = 'Nothing to show for this period.' }) {
  return (
    <section>
      <h2>{title}</h2>
      {rows.length === 0 ? <EmptyState title={empty} /> : (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">{title}</caption>
            <thead><tr>{columns.map((c) => <th key={c.head}>{c.head}</th>)}</tr></thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>{columns.map((c) => <td key={c.head} data-label={c.head}>{c.cell(row)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// Horizontal bars, drawn with plain divs (no chart library).
function Bars({ title, rows }) {
  const biggest = Math.max(1, ...rows.map((r) => r.count))
  return (
    <section>
      <h2>{title}</h2>
      <div className="card" role="img" aria-label={title}>
        {rows.map((r) => (
          <div className="bar-row" key={r.label}>
            <span>{r.label}</span>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${(r.count / biggest) * 100}%` }} /></div>
            <span>{r.count}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

const hourLabel = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`

// What was borrowed, when, and what may need replacing. Pick a date range (or leave both empty
// for everything), and download the numbers as a spreadsheet-friendly CSV file.
export default function Usage() {
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const badRange = fromDate && toDate && fromDate > toDate
  const { data, loading, error, reload } = useApi(
    () => (badRange ? Promise.resolve(null) : api.usageReport({ from_date: fromDate, to_date: toDate })),
    [fromDate, toDate],
  )

  function download() {
    const s = data.summary
    downloadCsv(`equipflow-report${fromDate ? `-from-${fromDate}` : ''}${toDate ? `-to-${toDate}` : ''}.csv`, [
      ['Summary'], ['Total borrows', s.total_borrows], ['Returned', s.returned], ['Returned late', s.returned_late],
      ['On-time rate %', s.on_time_rate], ['Average loan days', s.avg_loan_days], [],
      ['Most borrowed'], ['Item', 'Category', 'Borrows', 'Late', 'Late %'],
      ...data.most_borrowed.map((r) => [r.name, r.category, r.borrow_count, r.late_count, r.late_rate]), [],
      ['Often returned late'], ['Item', 'Category', 'Borrows', 'Late', 'Late %'],
      ...data.frequently_overdue.map((r) => [r.name, r.category, r.borrow_count, r.late_count, r.late_rate]), [],
      ['By category'], ['Category', 'Type', 'Borrows', 'Average loan days'],
      ...data.by_category.map((r) => [r.name, TYPE_LABELS[r.type], r.borrow_count, r.avg_loan_days]), [],
      ['May need maintenance or replacing'], ['Item', 'Category', 'Condition', 'Total borrows', 'Damage reports', 'Why'],
      ...data.maintenance.map((r) => [r.name, r.category, CONDITION[r.condition].label, r.total_borrows, r.damage_reports, r.reasons.map((x) => REASONS[x] || x).join('; ')]),
    ])
  }

  const itemColumns = [
    { head: 'Item', cell: (r) => <strong>{r.name}</strong> },
    { head: 'Category', cell: (r) => r.category },
    { head: 'Borrows', cell: (r) => r.borrow_count },
    { head: 'Late', cell: (r) => `${r.late_count} (${percent(r.late_rate)})` },
  ]

  return (
    <>
      <PrintMeta title="Usage report" fromDate={fromDate} toDate={toDate} />
      <div className="toolbar no-print">
        <p className="muted">Borrowing by date range. Leave the dates empty to include everything.</p>
        <span className="row-actions" style={{ flexDirection: 'row' }}>
          <button type="button" className="btn btn-small" disabled={!data} onClick={download}>Download CSV</button>
          <button type="button" className="btn btn-small btn-primary" disabled={!data} onClick={() => window.print()}>Print / Save as PDF</button>
        </span>
      </div>

      <div className="filters-dates no-print">
        <label>From<input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></label>
        <label>To<input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></label>
      </div>

      {badRange && <ErrorBox message="The start date must be before the end date." />}
      {loading && !data && !badRange && <Loading />}
      {error && <ErrorBox message={error} onRetry={reload} />}

      {data && !badRange && (
        <>
          <section className="tiles" aria-label="Summary">
            <Tile value={data.summary.total_borrows} label="Borrows" />
            <Tile value={data.summary.returned} label="Returned" />
            <Tile value={data.summary.returned_late} label="Returned late" />
            <Tile value={percent(data.summary.on_time_rate)} label="On time" />
            <Tile value={days(data.summary.avg_loan_days)} label="Average loan" />
          </section>

          <Section title="Most borrowed" rows={data.most_borrowed} columns={itemColumns} />
          <Section title="Often returned late" rows={data.frequently_overdue} columns={itemColumns} />
          <Section title="By category" rows={data.by_category} columns={[
            { head: 'Category', cell: (r) => <strong>{r.name}</strong> },
            { head: 'Type', cell: (r) => TYPE_LABELS[r.type] },
            { head: 'Borrows', cell: (r) => r.borrow_count },
            { head: 'Average loan', cell: (r) => days(r.avg_loan_days) },
          ]} />

          {data.summary.total_borrows > 0 && (
            <>
              <Bars title="Busiest weekdays" rows={data.by_weekday.map((d) => ({ label: d.weekday, count: d.count }))} />
              <Bars title="Busiest hours" rows={data.by_hour.filter((h) => h.count > 0).map((h) => ({ label: hourLabel(h.hour), count: h.count }))} />
            </>
          )}

          <Section title="May need maintenance or replacing" rows={data.maintenance} empty="Nothing needs attention." columns={[
            { head: 'Item', cell: (r) => <><strong>{r.name}</strong><span className="muted small block">{r.category}</span></> },
            { head: 'Condition', cell: (r) => <Badge tone={CONDITION[r.condition].tone}>{CONDITION[r.condition].label}</Badge> },
            { head: 'Borrows', cell: (r) => r.total_borrows },
            { head: 'Why', cell: (r) => r.reasons.map((x) => REASONS[x] || x).join(', ') },
          ]} />
        </>
      )}
    </>
  )
}
