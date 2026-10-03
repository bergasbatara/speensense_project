import { describe, expect, it } from 'vitest'
import { canRead, canCreate, canUpdate, canDelete, lintSchema } from 'deepspace/worker'
import { transactionsSchema } from '../schemas/transactions-schema'
import { parseAmount, summarizeTransactions, transactionInput, transactionFilters, matchesTransaction, type TransactionInput } from './transactions'

const transaction: TransactionInput = { date: '2026-10-02', merchant: 'Coffee shop', amountMinor: 1250, currency: 'USD', direction: 'expense', category: 'Coffee & Drinks', source: 'manual', status: 'confirmed' }

describe('financial validation and calculations', () => {
  it('converts decimal input exactly to cents', () => {
    expect(parseAmount('0.29')).toBe(29)
    expect(parseAmount('12.5')).toBe(1250)
    expect(parseAmount(' 12 ')).toBe(1200)
  })
  it.each(['', '-1', '0', '1.005', '1e3', 'NaN', 'Infinity', '9007199254740991'])('rejects unsupported amount %s', value => {
    expect(() => parseAmount(value)).toThrow()
  })
  it.each([{ date: '2026-02-30' }, { amountMinor: 1.5 }, { amountMinor: -1 }, { currency: 'EUR' }, { category: 'Unknown' }, { merchant: '   ' }, { userId: 'someone-else' }])('rejects invalid or forged transaction fields %o', patch => {
    expect(transactionInput.safeParse({ ...transaction, ...patch }).success).toBe(false)
  })
  it('keeps income separate from expenses and excludes unconfirmed rows', () => {
    const result = summarizeTransactions([transaction, { ...transaction, amountMinor: 29 }, { ...transaction, direction: 'income', amountMinor: 2000 }, { ...transaction, status: 'pending', amountMinor: 99999 }])
    expect(result).toMatchObject({ expenseMinor: 1279, incomeMinor: 2000, netMinor: 721, count: 3, byCategory: { 'Coffee & Drinks': 1279 } })
  })
  it('filters inclusive dates and merchant without case sensitivity', () => {
    expect(matchesTransaction(transaction, { from: '2026-10-02', to: '2026-10-02', merchant: 'COFFEE' })).toBe(true)
    expect(summarizeTransactions([transaction], { from: '2026-10-03' }).count).toBe(0)
    expect(transactionFilters.safeParse({ from: '2026-10-03', to: '2026-10-02' }).success).toBe(false)
  })
  it('fails rather than rounding an overflowing total', () => {
    expect(() => summarizeTransactions([{ ...transaction, amountMinor: Number.MAX_SAFE_INTEGER }, transaction])).toThrow()
  })
})

describe('DeepSpace transaction permissions', () => {
  const record = { data: { userId: 'alice' }, createdBy: 'alice' }
  it('has no schema lint warnings', () => expect(lintSchema(transactionsSchema)).toEqual([]))
  it.each(['member', 'admin', 'viewer'])('%s can read only their own records and cannot bypass validated writes', role => {
    expect(canRead(transactionsSchema, role, record, 'alice')).toBe(true)
    expect(canRead(transactionsSchema, role, record, 'bob')).toBe(false)
    expect(canCreate(transactionsSchema, role)).toBe(false)
    expect(canUpdate(transactionsSchema, role, record, 'alice')).toBe(false)
    expect(canDelete(transactionsSchema, role, record, 'alice')).toBe(false)
  })
  it('anonymous users cannot read transactions', () => expect(canRead(transactionsSchema, '*', record, 'alice')).toBe(false))
})
