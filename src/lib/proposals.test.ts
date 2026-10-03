import { describe, expect, it } from 'vitest'
import { buildCategoryPreview, sameTransaction } from './proposals'
import type { TransactionInput } from './transactions'

const before: TransactionInput = { merchant: 'Starbucks Downtown', date: '2026-10-03', amountMinor: 1250, category: 'Dining', direction: 'expense', currency: 'USD', source: 'manual', status: 'confirmed' }
describe('category proposals', () => {
  it('matches merchant and dates, excludes already-categorized and pending records', () => {
    const preview = buildCategoryPreview([
      { recordId: '1', data: before },
      { recordId: '2', data: { ...before, category: 'Coffee & Drinks' } },
      { recordId: '3', data: { ...before, status: 'pending' } },
      { recordId: '4', data: { ...before, date: '2026-09-30' } },
    ], { filters: { merchant: 'STARBUCKS', from: '2026-10-01' }, category: 'Coffee & Drinks' })
    expect(preview.rows.map(row => row.recordId)).toEqual(['1'])
    expect(preview.summary.expenseMinor).toBe(1250)
    expect(before.category).toBe('Dining')
  })
  it('requires explicit merchant scope and a supported category', () => {
    expect(() => buildCategoryPreview([], { filters: {}, category: 'Dining' })).toThrow()
    expect(() => buildCategoryPreview([], { filters: { merchant: 'a' }, category: 'Unknown' })).toThrow()
  })
  it('refuses empty and oversized proposals', () => {
    expect(() => buildCategoryPreview([], { filters: { merchant: 'Starbucks' }, category: 'Groceries' })).toThrow('No matching')
    const rows = Array.from({ length: 101 }, (_, i) => ({ recordId: String(i), data: before }))
    expect(() => buildCategoryPreview(rows, { filters: { merchant: 'Starbucks' }, category: 'Groceries' })).toThrow('More than 100')
  })
  it('compares all normalized transaction fields before approval', () => {
    expect(sameTransaction(before, { ...before })).toBe(true)
    for (const patch of [{ amountMinor: 1200 }, { category: 'Other' }, { merchant: 'Other' }, { date: '2026-10-04' }, { direction: 'income' }, { status: 'pending' }]) {
      expect(sameTransaction({ ...before, ...patch }, before)).toBe(false)
    }
  })
})
