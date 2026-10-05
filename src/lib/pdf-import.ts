import { MAX_IMPORT_ROWS, type CsvTable } from './csv-import'

export const MAX_PDF_BYTES = 10 * 1024 * 1024
export const MAX_PDF_PAGES = 20
export const MAX_PDF_TEXT = 300_000

// Explicit full dates only: never infer a year or assume which slash component
// is the month. The existing mapping step asks for the date format.
const datedLine = /^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})\s+(.+)$/
const trailingAmount = /^(.*?)\s+([+-]?\$?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}|\(\$?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\))(?:\s+(CR|DR|Credit|Debit))?$/i

export function parseStatementText(text: string): { table: CsvTable; skipped: string[] } {
  if (text.length > MAX_PDF_TEXT) throw new Error('Statement text is too large. Import a smaller statement.')
  if (/\b(EUR|GBP|CAD|AUD|JPY)\b|[€£¥]/i.test(text)) throw new Error('This statement mentions a non-USD currency. Use a USD-only statement or CSV export.')
  const rows: string[][] = [], skipped: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/\s+/g, ' ')
    if (!line) continue
    const date = datedLine.exec(line)
    const amount = date && trailingAmount.exec(date[2])
    // Two dates or multiple amounts generally mean a posting-date/balance or
    // separate debit/credit layout. Do not silently select one monetary value.
    if (!date || !amount || !amount[1].trim() || /\b\d+[.,]\d{2}\b|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2}/.test(amount[1]) || /\b(balance|total|opening|closing)\b/i.test(amount[1])) {
      skipped.push(line)
      continue
    }
    const direction = /^(CR|Credit)$/i.test(amount[3] ?? '') ? 'Income' : /^(DR|Debit)$/i.test(amount[3] ?? '') ? 'Expense' : ''
    rows.push([date[1], amount[1].trim(), amount[2], direction])
    if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Import at most ${MAX_IMPORT_ROWS} transactions at a time`)
  }
  if (!rows.length) throw new Error('No supported transaction rows found. Use a full date, merchant, and one amount per line, or import a CSV export.')
  // Preserve explicit types in mixed statements; untyped rows then need a
  // user correction rather than silently overriding CR/DR indicators.
  const hasTyped = rows.some(row => row[3] !== '')
  return { table: { headers: hasTyped ? ['Date', 'Merchant', 'Amount', 'Type'] : ['Date', 'Merchant', 'Amount'], rows: hasTyped ? rows : rows.map(row => row.slice(0, 3)) }, skipped }
}

export type PositionedText = { str: string; transform: number[]; hasEOL?: boolean }
export function textItemsToLines(items: PositionedText[]): string[] {
  const lines: { y: number; items: { x: number; str: string }[] }[] = []
  for (const item of [...items].sort((a, b) => b.transform[5] - a.transform[5])) {
    if (!item.str.trim()) continue
    const y = item.transform[5], x = item.transform[4]
    let line = lines.at(-1)
    if (line && Math.abs(line.y - y) >= 2) line = undefined
    if (!line) { line = { y, items: [] }; lines.push(line) }
    line.items.push({ x, str: item.str })
  }
  return lines.sort((a, b) => b.y - a.y).map(line => line.items.sort((a, b) => a.x - b.x).map(item => item.str).join(' '))
}

export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  if (buffer.byteLength > MAX_PDF_BYTES) throw new Error('PDF must be 10 MB or smaller')
  if (!new TextDecoder().decode(buffer.slice(0, 8)).startsWith('%PDF-')) throw new Error('This file is not a PDF')
  const pdfjs = await import('pdfjs-dist')
  const { default: workerSrc } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), stopAtErrors: true, disableFontFace: true, useSystemFonts: false, verbosity: 0 })
  const timer = setTimeout(() => { void task.destroy() }, 30_000)
  try {
    const document = await task.promise
    if (document.numPages > MAX_PDF_PAGES) throw new Error(`PDF must have at most ${MAX_PDF_PAGES} pages`)
    const pages: string[] = []
    let length = 0
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      if (content.items.length > 10_000) throw new Error(`Page ${pageNumber} has too many text fragments. Use a simpler PDF or CSV export.`)
      const items = content.items.filter((item): item is typeof item & PositionedText => 'str' in item)
      const text = textItemsToLines(items).join('\n')
      if (!text.trim()) throw new Error(`Page ${pageNumber} has no selectable text. Scanned statements need OCR; use a text-based PDF or CSV export.`)
      length += text.length
      if (length > MAX_PDF_TEXT) throw new Error('Statement text is too large. Import a smaller statement.')
      pages.push(text); page.cleanup()
    }
    const text = pages.join('\n')
    if (!text.trim()) throw new Error('This PDF has no selectable text. Scanned statements need OCR; use a text-based PDF or CSV export.')
    return text
  } catch (e) {
    if (e instanceof Error && e.name === 'PasswordException') throw new Error('Password-protected PDFs are not supported. Export an unlocked text-based statement.')
    throw e
  } finally { clearTimeout(timer); await task.destroy() }
}

export async function digestPdf(buffer: ArrayBuffer) {
  const bytes = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}
