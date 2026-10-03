import { z } from 'zod'

export const CATEGORIES = ['Uncategorized', 'Groceries', 'Dining', 'Coffee & Drinks', 'Transportation', 'Shopping', 'Subscriptions', 'Housing', 'Utilities', 'Health', 'Entertainment', 'Income', 'Other'] as const

export const transactionInput = z.object({
  date: z.iso.date(),
  merchant: z.string().trim().min(1, 'Merchant is required').max(200),
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.literal('USD'),
  direction: z.enum(['expense', 'income']),
  category: z.enum(CATEGORIES),
  source: z.enum(['manual', 'csv', 'pdf', 'image']),
  status: z.enum(['pending', 'confirmed']),
}).strict()

export type TransactionInput = z.infer<typeof transactionInput>
export type Transaction = TransactionInput & { userId: string }

export const transactionFilters = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  category: z.enum(CATEGORIES).optional(),
  merchant: z.string().trim().max(200).optional(),
  direction: z.enum(['expense', 'income']).optional(),
}).strict().refine(f => !f.from || !f.to || f.from <= f.to, 'Start date must be before end date')
export type TransactionFilters = z.infer<typeof transactionFilters>

export function parseAmount(value: string): number {
  const text = value.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('Enter a positive amount with at most two decimal places')
  const [whole, fraction = ''] = text.split('.')
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Amount is outside the supported range')
  return amount
}

export function matchesTransaction(t: TransactionInput, f: TransactionFilters): boolean {
  return (!f.from || t.date >= f.from) && (!f.to || t.date <= f.to)
    && (!f.category || t.category === f.category)
    && (!f.direction || t.direction === f.direction)
    && (!f.merchant || t.merchant.toLowerCase().includes(f.merchant.toLowerCase()))
}

function addMinor(a: number, b: number): number {
  const result = a + b
  if (!Number.isSafeInteger(result)) throw new Error('Total exceeds the supported range')
  return result
}

export function summarizeTransactions(transactions: TransactionInput[], filters: TransactionFilters = {}) {
  let expenseMinor = 0
  let incomeMinor = 0
  let count = 0
  const byCategory: Record<string, number> = {}
  for (const raw of transactions) {
    const t = transactionInput.parse(raw)
    if (t.status !== 'confirmed' || !matchesTransaction(t, filters)) continue
    count++
    if (t.direction === 'income') incomeMinor = addMinor(incomeMinor, t.amountMinor)
    else {
      expenseMinor = addMinor(expenseMinor, t.amountMinor)
      byCategory[t.category] = addMinor(byCategory[t.category] ?? 0, t.amountMinor)
    }
  }
  return { currency: 'USD' as const, expenseMinor, incomeMinor, netMinor: incomeMinor - expenseMinor, count, byCategory }
}

export function formatMoney(amountMinor: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amountMinor / 100)
}
