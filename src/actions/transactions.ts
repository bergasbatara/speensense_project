import { z } from 'zod'
import type { ActionHandler, ActionContext } from 'deepspace/worker'
import type { Env } from '../../worker'
import { transactionInput, transactionFilters, matchesTransaction, summarizeTransactions, type Transaction } from '../lib/transactions'

const recordId = z.string().min(1).max(200)
const createInput = transactionInput.extend({ source: z.literal('manual'), status: z.literal('confirmed') })
const updateInput = transactionInput.omit({ source: true, status: true }).partial().strict().refine(v => Object.keys(v).length > 0, 'Supply at least one change')
const failure = (error: string) => ({ success: false as const, error })

export async function canWrite(ctx: ActionContext<Env>): Promise<boolean> {
  const profile = await ctx.tools.get('users', ctx.userId)
  return profile.success && ['member', 'admin'].includes(String(profile.data.record.data.role))
}

async function ownedRecord(ctx: ActionContext<Env>, id: string) {
  const result = await ctx.tools.get('transactions', id)
  if (!result.success || result.data.record.data.userId !== ctx.userId) return null
  return result.data.record
}

export const transactionActions: Record<string, ActionHandler<Env>> = {
  createTransaction: async (ctx) => {
    if (!await canWrite(ctx)) return failure('Transaction writes are not permitted for this account')
    const parsed = createInput.safeParse(ctx.params)
    if (!parsed.success) return failure(parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '))
    return ctx.tools.create('transactions', { ...parsed.data, userId: ctx.userId })
  },
  updateTransaction: async (ctx) => {
    if (!await canWrite(ctx)) return failure('Transaction writes are not permitted for this account')
    const input = z.object({ recordId, patch: updateInput }).strict().safeParse(ctx.params)
    if (!input.success) return failure('Invalid transaction changes')
    const record = await ownedRecord(ctx, input.data.recordId)
    if (!record) return failure('Transaction not found')
    const { userId: _owner, ...existing } = record.data
    const next = transactionInput.safeParse({ ...existing, ...input.data.patch })
    if (!next.success) return failure('Invalid transaction changes')
    return ctx.tools.update('transactions', record.recordId, input.data.patch)
  },
  deleteTransaction: async (ctx) => {
    if (!await canWrite(ctx)) return failure('Transaction writes are not permitted for this account')
    const input = z.object({ recordId }).strict().safeParse(ctx.params)
    if (!input.success) return failure('Invalid transaction ID')
    const record = await ownedRecord(ctx, input.data.recordId)
    if (!record) return failure('Transaction not found')
    return ctx.tools.remove('transactions', record.recordId)
  },
  getSpendingSummary: async (ctx) => {
    const input = transactionFilters.safeParse(ctx.params)
    if (!input.success) return failure('Invalid spending filters')
    const result = await ctx.tools.query('transactions', { where: { userId: ctx.userId } })
    if (!result.success) return result
    try {
      // Query is explicitly owner-scoped because server actions bypass RBAC.
      const rows = result.data.records.map(r => {
        const { userId: _owner, ...data } = r.data
        return transactionInput.parse(data)
      })
      return { success: true, data: summarizeTransactions(rows, input.data) }
    } catch { return failure('Unable to calculate totals for these transactions') }
  },
  listTransactions: async (ctx) => {
    const input = transactionFilters.safeParse(ctx.params)
    if (!input.success) return failure('Invalid transaction filters')
    const result = await ctx.tools.query('transactions', { where: { userId: ctx.userId }, orderBy: 'date', orderDir: 'desc' })
    if (!result.success) return result
    const records = result.data.records.filter(r => matchesTransaction(r.data as Transaction, input.data))
    return { success: true, data: { records, count: records.length } }
  },
}
