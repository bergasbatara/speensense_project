import { describe, expect, it } from 'vitest'
import { canRead, lintSchema } from 'deepspace/worker'
import { importsSchema } from '../schemas/imports-schema'
import { buildReview, digestText, importCommitInput, normalizeDate, parseCsv, suggestMapping, validateReviewRow } from './csv-import'

describe('CSV parsing and normalization', () => {
  it('handles BOM, CRLF, commas, escaped quotes, and quoted newlines', () => {
    const parsed = parseCsv('\uFEFFDate,Description,Amount\r\n2026-10-02,"Cafe, ""Main""\nBranch",-12.50\r\n')
    expect(parsed.rows).toEqual([['2026-10-02', 'Cafe, "Main"\nBranch', '-12.50']])
  })
  it.each(['A,B\n"unclosed,x', 'A,B\nx', 'A,A\nx,y', 'A,B\n"x"junk,y', 'A,B\nx"x,y', 'A,B\n'])('rejects malformed CSV %s', input => expect(() => parseCsv(input)).toThrow())
  it('keeps repeated transactions as separate review rows', () => {
    const table = parseCsv('Date,Merchant,Amount\n2026-10-02,Cafe,-5\n2026-10-02,Cafe,-5')
    const rows = buildReview(table, suggestMapping(table.headers), 'iso', 'negative-expense')
    expect(rows.map(r => r.rowNumber)).toEqual([2, 3])
    expect(rows.map(r => validateReviewRow(r).data?.amountMinor)).toEqual([500, 500])
  })
  it('normalizes explicitly selected dates and amount conventions', () => {
    expect(normalizeDate('3/10/2026', 'dmy')).toBe('2026-10-03')
    const table = parseCsv('Posting Date,Description,Amount\n10/2/2026,Cafe,"$1,234.56"\n10/3/2026,Refund,(5.75)')
    const rows = buildReview(table, suggestMapping(table.headers), 'mdy', 'positive-expense')
    expect(validateReviewRow(rows[0]).data).toMatchObject({ amountMinor: 123456, date: '2026-10-02', direction: 'expense' })
    expect(validateReviewRow(rows[1]).data).toMatchObject({ amountMinor: 575, direction: 'income' })
  })
  it('preserves invalid rows for correction, including unknown categories', () => {
    const table = parseCsv('Date,Merchant,Amount,Category\n2026-02-30,Cafe,-1.005,Unknown')
    const rows = buildReview(table, suggestMapping(table.headers), 'iso', 'negative-expense')
    expect(validateReviewRow(rows[0]).errors.length).toBeGreaterThan(0)
    expect(validateReviewRow({ ...rows[0], date: '2026-10-02', amount: '1.01', category: 'Dining' }).errors).toEqual([])
  })
  it('enforces row limits', () => expect(() => parseCsv('A\n' + Array(201).fill('x').join('\n'))).toThrow('200'))
  it('refuses foreign currencies instead of labeling them as USD', () => {
    const table = parseCsv('Date,Merchant,Amount,Currency\n2026-10-02,Cafe,-5,EUR')
    expect(() => buildReview(table, suggestMapping(table.headers), 'iso', 'negative-expense')).toThrow('Only USD')
  })
  it('rejects duplicate row identifiers and forged ownership before committing', () => {
    const transaction = { date: '2026-10-02', merchant: 'Cafe', amountMinor: 100, currency: 'USD', direction: 'expense', category: 'Dining', source: 'csv', status: 'confirmed' }
    const row = { rowNumber: 2, transaction }
    expect(importCommitInput.safeParse({ fileDigest: 'a'.repeat(64), fileName: 'test.csv', rows: [row, row] }).success).toBe(false)
    expect(importCommitInput.safeParse({ fileDigest: 'a'.repeat(64), fileName: 'test.csv', rows: [{ ...row, transaction: { ...transaction, userId: 'other' } }] }).success).toBe(false)
  })
  it('produces a stable fingerprint', async () => {
    expect(await digestText('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('import privacy', () => {
  it('has no schema warnings and keeps reviews private even for admins', () => {
    expect(lintSchema(importsSchema)).toEqual([])
    for (const role of ['member', 'admin', 'viewer']) {
      const record = { data: { userId: 'alice' }, createdBy: 'alice' }
      expect(canRead(importsSchema, role, record, 'alice')).toBe(true)
      expect(canRead(importsSchema, role, record, 'bob')).toBe(false)
    }
  })
})
