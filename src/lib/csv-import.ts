import { z } from 'zod'
import { CATEGORIES, parseAmount, transactionInput, type TransactionInput } from './transactions'

export const MAX_CSV_BYTES = 2 * 1024 * 1024
export const MAX_IMPORT_ROWS = 200
export type CsvTable = { headers: string[]; rows: string[][] }
export type ColumnMapping = { date: string; merchant: string; amount: string; category: string; direction: string }
export type ReviewRow = { rowNumber: number; date: string; merchant: string; amount: string; category: string; direction: string; included: boolean }

// Comma-separated UTF-8 CSV, including escaped quotes and embedded newlines.
export function parseCsv(text: string): CsvTable {
  if (new TextEncoder().encode(text).length > MAX_CSV_BYTES) throw new Error('CSV must be 2 MB or smaller')
  const data: string[][] = []
  let row: string[] = [], field = '', quoted = false, closed = false
  const input = text.replace(/^\uFEFF/, '')
  function endField() { row.push(field); field = ''; closed = false }
  function endRow() {
    endField()
    if (row.some(v => v.trim())) data.push(row)
    if (data.length > MAX_IMPORT_ROWS + 1) throw new Error(`Import at most ${MAX_IMPORT_ROWS} transactions at a time`)
    row = []
  }
  for (let i = 0; i < input.length; i++) {
    const c = input[i]
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') { field += '"'; i++ }
        else { quoted = false; closed = true }
      } else field += c
    } else if (c === ',' ) endField()
    else if (c === '\n' || c === '\r') { if (c === '\r' && input[i + 1] === '\n') i++; endRow() }
    else if (c === '"') {
      if (field !== '' || closed) throw new Error('Unexpected quote in CSV')
      quoted = true
    } else {
      if (closed) throw new Error('Unexpected text after a quoted CSV value')
      field += c
    }
  }
  if (quoted) throw new Error('CSV has an unclosed quoted value')
  if (field || row.length) endRow()
  if (data.length < 2) throw new Error('CSV needs a header and at least one transaction')
  const headers = data[0].map(v => v.trim())
  if (headers.some(v => !v) || new Set(headers.map(v => v.toLowerCase())).size !== headers.length) throw new Error('CSV column names must be nonempty and unique')
  const rows = data.slice(1)
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Import at most ${MAX_IMPORT_ROWS} transactions at a time`)
  if (rows.some(r => r.length !== headers.length)) throw new Error('A CSV row has a different number of columns than the header')
  return { headers, rows }
}

export function suggestMapping(headers: string[]): ColumnMapping {
  function find(aliases: string[]) { return String(headers.findIndex(h => aliases.includes(h.toLowerCase().replace(/[^a-z]/g, '')))) }
  return { date: find(['date', 'transactiondate', 'postingdate', 'postdate']), merchant: find(['merchant', 'description', 'payee', 'name']), amount: find(['amount', 'transactionamount', 'total']), category: find(['category']), direction: find(['type', 'direction']) }
}

export function normalizeDate(raw: string, format: string): string {
  const text = raw.trim()
  if (format === 'iso') return text
  const parts = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text)
  if (!parts) return text
  const [, a, b, year] = parts
  const month = format === 'mdy' ? a : b
  const day = format === 'mdy' ? b : a
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

export function buildReview(table: CsvTable, mapping: ColumnMapping, dateFormat: string, convention: string): ReviewRow[] {
  const currencyColumn = table.headers.findIndex(h => h.trim().toLowerCase() === 'currency')
  if (currencyColumn >= 0 && table.rows.some(cells => cells[currencyColumn].trim().toUpperCase() !== 'USD')) throw new Error('Only USD imports are supported. Every value in the Currency column must be USD.')
  const required = [mapping.date, mapping.merchant, mapping.amount]
  if (required.some(v => Number(v) < 0) || new Set(required).size !== 3) throw new Error('Choose different columns for date, merchant, and amount')
  return table.rows.map((cells, index) => {
    const raw = cells[Number(mapping.amount)].trim().replace(/^\$/, '').replace(/,/g, '')
    const negative = raw.startsWith('-') || /^\(.*\)$/.test(raw)
    const amount = raw.replace(/^[+-]/, '').replace(/^\((.*)\)$/, '$1')
    const kind = (cells[Number(mapping.direction)] ?? '').trim().toLowerCase()
    const inferred = convention === 'positive-expense' ? (negative ? 'income' : 'expense') : (negative ? 'expense' : 'income')
    const direction = mapping.direction === '-1' ? inferred : ['debit', 'expense', 'purchase'].includes(kind) ? 'expense' : ['credit', 'income', 'deposit'].includes(kind) ? 'income' : kind
    const categoryText = (cells[Number(mapping.category)] ?? '').trim()
    const category = mapping.category === '-1' ? 'Uncategorized' : CATEGORIES.find(c => c.toLowerCase() === categoryText.toLowerCase()) ?? categoryText
    return { rowNumber: index + 2, date: normalizeDate(cells[Number(mapping.date)], dateFormat), merchant: cells[Number(mapping.merchant)].trim(), amount, category, direction, included: true }
  })
}

export function validateReviewRow(row: ReviewRow, source: 'csv' | 'pdf' = 'csv'): { data?: TransactionInput; errors: string[] } {
  let amountMinor: number
  try { amountMinor = parseAmount(row.amount) } catch (e) { return { errors: [(e as Error).message] } }
  const result = transactionInput.safeParse({ date: row.date, merchant: row.merchant, amountMinor, category: row.category, direction: row.direction, currency: 'USD', source, status: 'confirmed' })
  return result.success ? { data: result.data, errors: [] } : { errors: result.error.issues.map(i => `${String(i.path[0])}: ${i.message}`) }
}

export const importReviewInput = z.object({ fileDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict()

export const importCommitInput = z.object({
  fileDigest: importReviewInput.shape.fileDigest,
  fileName: z.string().trim().min(1).max(200),
  rows: z.array(z.object({ rowNumber: z.number().int().min(2).max(MAX_IMPORT_ROWS + 1), transaction: transactionInput.extend({ source: z.enum(['csv', 'pdf']), status: z.literal('confirmed') }) }).strict()).min(1).max(MAX_IMPORT_ROWS),
}).strict().refine(v => new Set(v.rows.map(r => r.rowNumber)).size === v.rows.length, 'Row numbers must be unique')

export async function digestText(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
}
