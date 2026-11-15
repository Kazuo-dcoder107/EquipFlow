import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'

describe('toCsv', () => {
  it('joins cells with commas and rows with new lines', () => {
    expect(toCsv([['Item', 'Borrows'], ['Laptop 01', 5]])).toBe('Item,Borrows\nLaptop 01,5')
  })

  it('quotes cells that contain commas, quotes or new lines, and leaves empty values empty', () => {
    expect(toCsv([['Hello, world', 'Say "hi"', null, undefined, 'a\nb']])).toBe('"Hello, world","Say ""hi""",,,"a\nb"')
  })
})
