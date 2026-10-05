import { normalizeDate, type ReviewRow } from './csv-import'
import { parseAmount } from './transactions'

export const MAX_ENTRY_TEXT = 2000
export const MAX_RECEIPT_TEXT = 30000
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function assertUsd(text: string) {
  if (/\b(EUR|GBP|CAD|AUD|NZD|JPY|CNY|INR|IDR|CHF|SGD|HKD)\b|[€£¥₹]/i.test(text)) throw new Error('Only USD entries are supported. Check the currency before continuing.')
}
const blank = (): ReviewRow => ({ rowNumber: 2, date: '', merchant: '', amount: '', category: 'Uncategorized', direction: 'expense', included: true })

// Deliberately small grammar; unsupported descriptions require editing rather
// than a model inventing dates, amounts, or merchants.
export function parseDescription(raw: string, now = new Date()): { row: ReviewRow; notes: string[] } {
  if (raw.length > MAX_ENTRY_TEXT) throw new Error('Describe one transaction in 2,000 characters or fewer.')
  assertUsd(raw)
  let text = raw.trim().replace(/[.!]$/, '').replace(/\s+/g, ' ')
  let date = localDate(now)
  const notes: string[] = []
  const when = /\s+(today|yesterday|on \d{4}-\d{2}-\d{2})$/i.exec(text)
  if (when) {
    if (when[1].toLowerCase() === 'yesterday') { const day = new Date(now); day.setDate(day.getDate() - 1); date = localDate(day) }
    else if (when[1].toLowerCase().startsWith('on ')) date = when[1].slice(3)
    text = text.slice(0, when.index)
  } else notes.push(`No date provided; using ${date} in your browser's local time. Change it if needed.`)
  const match = /^(?:I )?(spent|paid|received|earned)\s+(?:\$|USD\s+)(\d+(?:,\d{3})*(?:\.\d{1,2})?)\s+(at|to|for|from)\s+(.+)$/i.exec(text)
  if (!match || /\$|\bUSD\b|\b(today|yesterday|tomorrow|last|next)\b|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}/i.test(match[4])) throw new Error('Use one transaction, for example: “Spent $12.50 at Starbucks yesterday” or “Received $2500 from Employer on 2026-10-01”.')
  const income = /^(received|earned)$/i.test(match[1])
  if ((income && match[3].toLowerCase() !== 'from') || (!income && match[3].toLowerCase() === 'from')) throw new Error('Use “from” for income, and “at”, “to”, or “for” for an expense.')
  const minor = parseAmount(match[2].replaceAll(',', ''))
  const row = { ...blank(), date, merchant: match[4].trim(), amount: (minor / 100).toFixed(2), direction: income ? 'income' : 'expense', category: income ? 'Income' : 'Uncategorized' }
  return { row, notes }
}

export function parseReceiptText(text: string, dateFormat: 'mdy' | 'dmy' = 'mdy'): { row: ReviewRow; notes: string[] } {
  if (text.length > MAX_RECEIPT_TEXT) throw new Error('Receipt text is too long. Use a smaller receipt.')
  assertUsd(text)
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (!lines.length) throw new Error('No receipt text found. Try a clearer photo or paste the receipt text.')
  const row = blank(), notes = ['Check the merchant, date, final total (including tax/tip), and USD currency against the original receipt.']
  row.merchant = lines.find(line => /[a-z]/i.test(line) && !/\b(receipt|invoice|USD|date|total|tax|cash|change|visa|mastercard|thank|welcome)\b/i.test(line) && !/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}|\d+\.\d{2}/.test(line))?.slice(0, 200) ?? ''
  const dates = [...new Set((text.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b/g) ?? []).map(raw => raw.includes('/') ? normalizeDate(raw, dateFormat) : raw))]
  if (dates.length === 1) row.date = dates[0]
  else notes.push(dates.length ? 'Multiple dates found; choose the transaction date.' : 'No full date found; enter the transaction date.')
  const totals = lines.flatMap(line => {
    const match = /^(?:grand\s+total|total(?:\s+(?:due|paid|amount))?|amount\s+due)\s*[:\-]?\s*(?:USD\s*)?\$?\s*(\d+(?:,\d{3})*\.\d{2})(?:\s*USD)?$/i.exec(line)
    return match ? [match[1].replaceAll(',', '')] : []
  })
  const unique = [...new Set(totals)]
  if (unique.length === 1) row.amount = unique[0]
  else notes.push(unique.length ? 'Conflicting totals found; enter the final amount yourself.' : 'No unambiguous final total found; enter the final amount yourself.')
  if (!row.merchant) notes.push('No clear merchant found; enter the merchant.')
  return { row, notes }
}
