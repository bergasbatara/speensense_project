import { describe, expect, it } from 'vitest'
import { parseStatementText, textItemsToLines } from './pdf-import'
import { buildReview, suggestMapping, validateReviewRow } from './csv-import'

describe('statement rows', () => {
  it('extracts typed purchases/deposits and excludes balance lines', () => {
    const parsed = parseStatementText('Statement USD\n2026-10-01 Cafe $12.50 DR\n2026-10-02 Salary 1,000.00 CR\n2026-10-03 Closing balance 500.00')
    expect(parsed.table.rows).toHaveLength(2)
    expect(parsed.skipped).toHaveLength(2)
    const rows = buildReview(parsed.table, suggestMapping(parsed.table.headers), 'iso', 'positive-expense')
    expect(validateReviewRow(rows[0], 'pdf').data).toMatchObject({ source: 'pdf', amountMinor: 1250, direction: 'expense' })
    expect(validateReviewRow(rows[1], 'pdf').data).toMatchObject({ amountMinor: 100000, direction: 'income' })
  })
  it('preserves explicit slash-date and sign choices', () => {
    const parsed = parseStatementText('03/10/2026 Cafe -12.50\n04/10/2026 Payroll 1000.00')
    const rows = buildReview(parsed.table, suggestMapping(parsed.table.headers), 'dmy', 'negative-expense')
    expect(validateReviewRow(rows[0], 'pdf').data).toMatchObject({ date: '2026-10-03', direction: 'expense' })
  })
  it('skips multiple amounts, posting dates, and missing years', () => {
    const parsed = parseStatementText('2026-10-01 Cafe 12.50\n2026-10-02 Shop 20.00 500.00\n10/03 Cafe 4.50\n2026-10-04 2026-10-03 Store 5.00')
    expect(parsed.table.rows).toHaveLength(1)
    expect(parsed.skipped).toHaveLength(3)
  })
  it('keeps missing types invalid in mixed typed statements', () => {
    const parsed = parseStatementText('2026-10-01 Cafe 12.50 DR\n2026-10-02 Salary 1000.00')
    const rows = buildReview(parsed.table, suggestMapping(parsed.table.headers), 'iso', 'positive-expense')
    expect(validateReviewRow(rows[1], 'pdf').errors.length).toBeGreaterThan(0)
  })
  it('rejects foreign currencies, no rows, and oversized imports', () => {
    expect(() => parseStatementText('Currency CAD\n2026-10-01 Cafe 12.50')).toThrow('non-USD')
    expect(() => parseStatementText('No rows here')).toThrow('No supported')
    expect(() => parseStatementText(Array(201).fill('2026-10-01 Cafe 12.50').join('\n'))).toThrow('200')
  })
  it('reconstructs split text by baseline and position', () => {
    const item = (str: string, x: number, y: number) => ({ str, transform: [1, 0, 0, 1, x, y] })
    expect(textItemsToLines([item('12.50', 200, 700), item('Cafe', 100, 700), item('2026-10-01', 0, 700), item('USD', 0, 750)])).toEqual(['USD', '2026-10-01 Cafe 12.50'])
  })
})
