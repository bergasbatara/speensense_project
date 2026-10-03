import { z } from 'zod'
import { CATEGORIES, transactionFilters, transactionInput, matchesTransaction, summarizeTransactions } from './transactions'

export const categoryProposalInput = z.object({
  filters: transactionFilters,
  category: z.enum(CATEGORIES),
}).strict().refine(value => !!value.filters.merchant?.trim(), 'Specify a merchant to match')
export const proposalRows = z.array(z.object({ recordId: z.string(), before: transactionInput })).min(1).max(100)
export type ProposalRow = z.infer<typeof proposalRows>[number]
export type Proposal = {
  userId: string; category: typeof CATEGORIES[number]; rows: ProposalRow[];
  status: 'pending' | 'applying' | 'approved' | 'cancelled' | 'stale';
  appliedIds: string[]; createdAt: string; expiresAt: string; resolvedAt?: string;
}

export function buildCategoryPreview(records: { recordId: string; data: z.infer<typeof transactionInput> }[], input: unknown) {
  const { filters, category } = categoryProposalInput.parse(input)
  const rows = records.filter(row => row.data.status === 'confirmed' && matchesTransaction(row.data, filters) && row.data.category !== category)
    .map(row => ({ recordId: row.recordId, before: transactionInput.parse(row.data) }))
  if (!rows.length) throw new Error('No matching transactions need this category change')
  if (rows.length > 100) throw new Error('More than 100 transactions match. Narrow your merchant or date filters.')
  return { filters, category, rows: proposalRows.parse(rows), count: rows.length, summary: summarizeTransactions(rows.map(row => row.before)) }
}

export function sameTransaction(current: unknown, expected: unknown) {
  const a = transactionInput.safeParse(current)
  const b = transactionInput.safeParse(expected)
  return a.success && b.success && JSON.stringify(a.data) === JSON.stringify(b.data)
}
