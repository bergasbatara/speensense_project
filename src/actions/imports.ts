import { RECORD_NOT_FOUND, type ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { canWrite } from './transactions'
import { digestText, importCommitInput, importReviewInput } from '../lib/csv-import'

const commitImport: ActionHandler<Env> = async ctx => {
  if (!await canWrite(ctx)) return { success: false, error: 'Import is not permitted for this account' }
  const parsed = importCommitInput.safeParse(ctx.params)
  if (!parsed.success) return { success: false, error: 'Fix invalid or repeated rows before saving' }
  const input = parsed.data
  // Uniqueness is enforced by the DO. Never take ownership from client input.
  const lookup = () => ctx.tools.query('imports', { where: { userId: ctx.userId, fileDigest: input.fileDigest } })
  let found = await lookup()
  if (!found.success) return found
  if (found.data.records.length === 0) {
    const created = await ctx.tools.create('imports', { userId: ctx.userId, fileDigest: input.fileDigest, fileName: input.fileName, rows: input.rows, status: 'saving' })
    // A concurrent commit may win the unique key; re-read its frozen snapshot.
    found = await lookup()
    if (!found.success) return found
    if (found.data.records.length === 0) return created.success ? { success: false, error: 'Could not load the saved review. Retry saving.' } : created
  }
  const job = found.data.records[0]
  if (job.data.status === 'completed') return { success: true, data: { importId: job.recordId, count: (job.data.rows as unknown[]).length, alreadyImported: true } }
  if (JSON.stringify(job.data.rows) !== JSON.stringify(input.rows)) return { success: false, error: 'This file has a partially saved import. Retry with the original approved rows.' }
  let saved = 0
  for (const row of input.rows) {
    const id = `${row.transaction.source}-${await digestText(`${ctx.userId}:${input.fileDigest}:${row.rowNumber}`)}`
    const existing = await ctx.tools.get('transactions', id)
    if (existing.success) {
      if (existing.data.record.data.userId !== ctx.userId) return { success: false, error: 'Import ownership mismatch' }
    } else {
      if (existing.error !== RECORD_NOT_FOUND) return { success: false, error: 'Could not check an existing transaction. Retry the same review.' }
      const result = await ctx.tools.create('transactions', { ...row.transaction, userId: ctx.userId }, id)
      if (!result.success) return { success: false, error: `${saved} of ${input.rows.length} rows saved. Retry the same review to resume. ${result.error}` }
    }
    saved++
  }
  const result = await ctx.tools.update('imports', job.recordId, { status: 'completed' })
  if (!result.success) return { success: false, error: 'Transactions saved, but import confirmation failed. Retry to confirm without duplicating rows.' }
  return { success: true, data: { importId: job.recordId, count: saved, alreadyImported: false } }
}

function commitSource(source: 'csv' | 'pdf'): ActionHandler<Env> {
  return async ctx => {
    const input = importCommitInput.safeParse(ctx.params)
    if (!input.success || input.data.rows.some(row => row.transaction.source !== source)) return { success: false, error: `Invalid ${source.toUpperCase()} import review` }
    return commitImport(ctx)
  }
}
export const commitCsvImport = commitSource('csv')
export const commitPdfImport = commitSource('pdf')

export const getCsvImportReview: ActionHandler<Env> = async ctx => {
  const parsed = importReviewInput.safeParse(ctx.params)
  if (!parsed.success) return { success: false, error: 'Invalid file identifier' }
  const result = await ctx.tools.query('imports', { where: { userId: ctx.userId, fileDigest: parsed.data.fileDigest } })
  if (!result.success) return result
  const job = result.data.records[0]
  return { success: true, data: job ? { status: job.data.status, rows: job.data.rows } : null }
}

export const commitDraftImport: ActionHandler<Env> = async ctx => {
  const input = importCommitInput.safeParse(ctx.params)
  if (!input.success || input.data.rows.length !== 1 || !['manual', 'image'].includes(input.data.rows[0].transaction.source)) return { success: false, error: 'Invalid transaction draft review' }
  return commitImport(ctx)
}
