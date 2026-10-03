import { describe, expect, it } from 'vitest'
import { dashboardData, monthRange } from './dashboard'
import type { Transaction } from './transactions'

const transaction: Transaction = { userId: 'alice', date: '2026-10-02', merchant: 'Cafe', amountMinor: 1000, currency: 'USD', direction: 'expense', category: 'Dining', source: 'manual', status: 'confirmed' }
const row = (id: string, patch: Partial<Transaction> = {}) => ({ recordId: id, data: { ...transaction, ...patch } })

describe('dashboard data', () => {
  it('calculates exact totals and expense-only category shares', () => {
    const data = dashboardData([row('a'), row('b', { amountMinor: 3000, category: 'Groceries' }), row('c', { direction: 'income', amountMinor: 6000, category: 'Income' }), row('d', { status: 'pending' })], {})
    expect(data.summary).toMatchObject({ expenseMinor: 4000, incomeMinor: 6000, netMinor: 2000, count: 3 })
    expect(data.categories).toEqual([{ category: 'Groceries', amountMinor: 3000, share: 75 }, { category: 'Dining', amountMinor: 1000, share: 25 }])
  })
  it('uses the same inclusive filters for totals, categories, and recent rows', () => {
    const data = dashboardData([row('a'), row('b', { date: '2026-10-03' }), row('c', { category: 'Groceries' })], { from: '2026-10-02', to: '2026-10-02', category: 'Dining' })
    expect(data.summary.count).toBe(1)
    expect(data.recent.map(r => r.recordId)).toEqual(['a'])
    expect(data.categories).toHaveLength(1)
  })
  it('caps recent rows without truncating totals', () => {
    const data = dashboardData(Array.from({ length: 15 }, (_, i) => row(String(i), { date: `2026-10-${String(i + 1).padStart(2, '0')}` })), {})
    expect(data.recent).toHaveLength(10)
    expect(data.recent[0].data.date).toBe('2026-10-15')
    expect(data.summary.expenseMinor).toBe(15000)
  })
  it('handles empty and income-only selections', () => {
    expect(dashboardData([], {}).summary.count).toBe(0)
    const data = dashboardData([row('a', { direction: 'income' })], {})
    expect(data.categories).toEqual([])
    expect(data.summary.netMinor).toBe(1000)
  })
  it('rejects invalid ranges rather than showing misleading totals', () => {
    expect(() => dashboardData([], { from: '2026-10-03', to: '2026-10-01' })).toThrow()
  })
  it('handles month and year boundaries, including leap years', () => {
    expect(monthRange(-1, new Date(2026, 0, 15))).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(monthRange(0, new Date(2024, 1, 15))).toEqual({ from: '2024-02-01', to: '2024-02-29' })
  })
})
