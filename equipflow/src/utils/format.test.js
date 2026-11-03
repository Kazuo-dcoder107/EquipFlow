import { describe, expect, it } from 'vitest'
import { dueStatus, fineReference, firstName, formatDate, peso } from './format'

const NOW = new Date('2026-03-10T08:00:00Z')
const at = (hours) => new Date(NOW.getTime() + hours * 3600 * 1000).toISOString()

describe('dueStatus', () => {
  it('counts whole days when there is more than a day left', () => {
    expect(dueStatus(at(72), NOW)).toEqual({ label: 'Due in 3 days', tone: 'ok' })
    expect(dueStatus(at(25), NOW)).toEqual({ label: 'Due in 1 day', tone: 'ok' })
  })

  it('switches to hours, with a warning tone, inside the last day', () => {
    expect(dueStatus(at(5), NOW)).toEqual({ label: 'Due in 5 hours', tone: 'warning' })
    expect(dueStatus(at(0.2), NOW)).toEqual({ label: 'Due in 1 hour', tone: 'warning' })
  })

  it('rounds late days up, like the backend fine', () => {
    expect(dueStatus(at(-1), NOW)).toEqual({ label: 'Overdue by 1 day', tone: 'danger' })
    expect(dueStatus(at(-25), NOW)).toEqual({ label: 'Overdue by 2 days', tone: 'danger' })
    expect(dueStatus(at(-72), NOW)).toEqual({ label: 'Overdue by 3 days', tone: 'danger' })
  })
})

describe('small formatters', () => {
  it('formats pesos', () => {
    expect(peso(50)).toBe('\u20B150')
    expect(peso(1250)).toBe('\u20B11,250')
    expect(peso(undefined)).toBe('\u20B10')
  })

  it('builds fine references', () => {
    expect(fineReference(7)).toBe('FINE-000007')
    expect(fineReference(123456)).toBe('FINE-123456')
  })

  it('takes the first name', () => {
    expect(firstName('Juan Dela Cruz')).toBe('Juan')
    expect(firstName('  Maria  ')).toBe('Maria')
    expect(firstName()).toBe('')
  })

  it('formats dates and tolerates a missing one', () => {
    expect(formatDate('2026-03-10T08:00:00Z')).toMatch(/2026/)
    expect(formatDate(null)).toBe('-')
  })
})
