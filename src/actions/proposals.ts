import { z } from 'zod'
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { canWrite } from './transactions'
import { categoryProposalInput, buildCategoryPreview, proposalRows, sameTransaction, type Proposal } from '../lib/proposals'
import { transactionInput } from '../lib/transactions'

const failure = (error: string) => ({ success: false as const, error })
const decisionInput = z.object({ proposalId: z.string().min(1).max(200) }).strict()

// These handlers run inside AppRecordRoom's serialized action boundary, so
// approvals cannot race each other, cancellations, or ordinary ledger edits.
export const proposalActions: Record<string, ActionHandler<Env>> = {
  proposeCategoryChange: async ctx => {
    if (!await canWrite(ctx)) return failure('Category changes are not permitted for this account')
    const parsed = categoryProposalInput.safeParse(ctx.params)
    if (!parsed.success) return failure('Choose a merchant and a valid category')
    const result = await ctx.tools.query('transactions', { where: { userId: ctx.userId } })
    if (!result.success) return result
    try {
      const records = result.data.records.map(record => {
        const { userId: _owner, ...fields } = record.data
        return { recordId: record.recordId, data: transactionInput.parse(fields) }
      })
      const preview = buildCategoryPreview(records, parsed.data)
      const now = new Date()
      return ctx.tools.create('proposals', { userId: ctx.userId, category: preview.category, rows: preview.rows, status: 'pending', appliedIds: [], createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 86400000).toISOString() })
    } catch (e) { return failure(e instanceof Error ? e.message : 'Could not prepare category changes') }
  },
  approveCategoryChange: async ctx => {
    if (!await canWrite(ctx)) return failure('Category changes are not permitted for this account')
    const input = decisionInput.safeParse(ctx.params)
    if (!input.success) return failure('Invalid proposal')
    const result = await ctx.tools.get('proposals', input.data.proposalId)
    if (!result.success || result.data.record.data.userId !== ctx.userId) return failure('Proposal not found')
    const proposal = result.data.record.data as unknown as Proposal
    if (proposal.status === 'approved') return { success: true, data: { count: proposal.rows.length, alreadyApproved: true } }
    if (!['pending', 'applying'].includes(proposal.status)) return failure('This proposal is no longer pending')
    if (proposal.status === 'pending' && Date.parse(proposal.expiresAt) <= Date.now()) {
      await ctx.tools.update('proposals', input.data.proposalId, { status: 'stale', resolvedAt: new Date().toISOString() })
      return failure('This proposal expired. Prepare a new review.')
    }
    const checked = proposalRows.safeParse(proposal.rows)
    if (!checked.success) return failure('Invalid saved proposal')
    // Validate the whole approved snapshot before the first category write.
    for (const row of checked.data) {
      const current = await ctx.tools.get('transactions', row.recordId)
      if (!current.success || current.data.record.data.userId !== ctx.userId) {
        if (proposal.status === 'pending') await ctx.tools.update('proposals', input.data.proposalId, { status: 'stale', resolvedAt: new Date().toISOString() })
        return failure('A reviewed transaction is unavailable. Prepare a new review.')
      }
      const { userId: _owner, ...fields } = current.data.record.data
      const after = { ...row.before, category: proposal.category }
      // Recover if a previous invocation stopped after a category write but
      // before its progress checkpoint. Still compare every other field.
      const alreadyApplied = proposal.status === 'applying' && sameTransaction(fields, after)
      const expected = proposal.appliedIds.includes(row.recordId) ? after : row.before
      if (!alreadyApplied && !sameTransaction(fields, expected)) {
        if (proposal.status === 'pending') await ctx.tools.update('proposals', input.data.proposalId, { status: 'stale', resolvedAt: new Date().toISOString() })
        return failure('A reviewed transaction changed. Prepare a new review before approving.')
      }
      if (alreadyApplied && !proposal.appliedIds.includes(row.recordId)) proposal.appliedIds.push(row.recordId)
    }
    const started = await ctx.tools.update('proposals', input.data.proposalId, { status: 'applying', appliedIds: proposal.appliedIds })
    if (!started.success) return started
    const appliedIds = [...proposal.appliedIds]
    for (const row of checked.data) {
      if (appliedIds.includes(row.recordId)) continue
      const saved = await ctx.tools.update('transactions', row.recordId, { category: proposal.category })
      if (!saved.success) return failure(`${appliedIds.length} of ${checked.data.length} changes saved. Retry this approval to resume.`)
      appliedIds.push(row.recordId)
      const progress = await ctx.tools.update('proposals', input.data.proposalId, { appliedIds })
      if (!progress.success) return failure('Changes saved, but recording progress failed. Refresh to review the saved state.')
    }
    const finished = await ctx.tools.update('proposals', input.data.proposalId, { status: 'approved', resolvedAt: new Date().toISOString() })
    if (!finished.success) return failure('Changes saved. Retry approval to confirm completion.')
    return { success: true, data: { count: checked.data.length, alreadyApproved: false } }
  },
  cancelCategoryChange: async ctx => {
    if (!await canWrite(ctx)) return failure('Category changes are not permitted for this account')
    const input = decisionInput.safeParse(ctx.params)
    if (!input.success) return failure('Invalid proposal')
    const result = await ctx.tools.get('proposals', input.data.proposalId)
    if (!result.success || result.data.record.data.userId !== ctx.userId) return failure('Proposal not found')
    if (result.data.record.data.status === 'cancelled') return { success: true, data: {} }
    if (result.data.record.data.status !== 'pending') return failure('Only pending proposals can be cancelled')
    return ctx.tools.update('proposals', input.data.proposalId, { status: 'cancelled', resolvedAt: new Date().toISOString() })
  },
}
