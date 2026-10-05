import { describe, expect, it } from 'vitest'
import { parseDescription, parseReceiptText } from './quick-entry'
import { validateReviewRow } from './csv-import'
const now = new Date(2026, 0, 1, 12)
describe('transaction descriptions', () => {
  it('resolves yesterday across the year boundary and exact cents', () => {
    const { row } = parseDescription('I spent $12.50 at Starbucks yesterday.', now)
    expect(row).toMatchObject({ date: '2025-12-31', merchant: 'Starbucks', amount: '12.50', direction: 'expense' })
    expect(validateReviewRow(row, 'manual').data).toMatchObject({ amountMinor: 1250, source: 'manual', status: 'confirmed' })
  })
  it('parses explicit income and comma amounts', () => {
    expect(parseDescription('Received USD 2,500 from Employer on 2026-10-01', now).row).toMatchObject({ date: '2026-10-01', merchant: 'Employer', amount: '2500.00', direction: 'income', category: 'Income' })
  })
  it('explains the local date default and accepts today', () => {
    expect(parseDescription('Paid $5 to Cafe', now).notes[0]).toContain('2026-01-01')
    expect(parseDescription('Spent $5 for Lunch today', now).row.date).toBe('2026-01-01')
  })
  it.each(['Spent €12 at Cafe', 'Spent $12 CAD at Cafe', 'Spent $5 at Cafe and $7 at Market', 'Spent $12 at Cafe tomorrow', 'Spent $12 at Cafe on 10/05/2026', 'Received $10 at Employer', 'Spent $0 at Cafe', 'Spent $12.555 at Cafe', 'Buy groceries', 'Spent $12 at Cafe last Monday'])('rejects unsupported or ambiguous text: %s', text => {
    expect(() => parseDescription(text, now)).toThrow()
  })
  it('keeps impossible dates invalid for review', () => {
    expect(validateReviewRow(parseDescription('Spent $12 at Cafe on 2026-02-30', now).row, 'manual').errors.length).toBeGreaterThan(0)
  })
})
describe('receipt drafts', () => {
  it('uses final total instead of items/subtotal/tax/cash/change', () => {
    const { row } = parseReceiptText('Cafe Example\n2026-10-05\nCoffee 10.00\nSUBTOTAL 10.00\nTAX 2.50\nTOTAL $12.50\nCASH 20.00\nCHANGE 7.50')
    expect(row).toMatchObject({ merchant: 'Cafe Example', date: '2026-10-05', amount: '12.50', direction: 'expense', category: 'Uncategorized' })
    expect(validateReviewRow(row, 'image').data?.source).toBe('image')
  })
  it('uses the selected slash-date convention', () => {
    const text = 'Cafe Example\n03/10/2026\nTOTAL 12.50'
    expect(parseReceiptText(text, 'mdy').row.date).toBe('2026-03-10')
    expect(parseReceiptText(text, 'dmy').row.date).toBe('2026-10-03')
  })
  it('leaves conflicting totals blank instead of choosing a smaller total', () => {
    const { row, notes } = parseReceiptText('Cafe\nTOTAL 10.00\nGRAND TOTAL 12.00')
    expect(row.amount).toBe('')
    expect(notes.join(' ')).toContain('Conflicting totals')
  })
  it('never infers amount from subtotal or date from a missing year', () => {
    const { row } = parseReceiptText('Cafe\n10/05\nSUBTOTAL 12.50')
    expect(row.date).toBe(''); expect(row.amount).toBe('')
    expect(validateReviewRow(row, 'image').errors.length).toBeGreaterThan(0)
  })
  it('leaves multiple dates blank and handles repeated equal totals', () => {
    const { row } = parseReceiptText('Cafe\n2026-10-05\n2026-10-06\nTOTAL 12.50\nTOTAL 12.50')
    expect(row.date).toBe(''); expect(row.amount).toBe('12.50')
  })
  it('rejects foreign currency, empty input, and excess text', () => {
    for (const text of ['Cafe\nTOTAL 12.50 CAD', '', 'x'.repeat(30001)]) expect(() => parseReceiptText(text)).toThrow()
  })
})
