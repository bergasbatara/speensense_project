import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutations, useUser } from 'deepspace'
import { Button, Checkbox, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, useToast } from '@/components/ui'
import { buildReview, digestText, MAX_CSV_BYTES, parseCsv, suggestMapping, validateReviewRow, type ColumnMapping, type CsvTable, type ReviewRow } from '@/lib/csv-import'
import { CATEGORIES, type Transaction, type TransactionInput } from '@/lib/transactions'
import { callAction } from '@/lib/actions-client'
import { digestPdf, extractPdfText, MAX_PDF_BYTES, parseStatementText } from '@/lib/pdf-import'

function Choice({ id, label, value, options, onChange, disabled = false }: { id: string; label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; disabled?: boolean }) {
  return <div><Label htmlFor={id}>{label}</Label><Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger id={id}><SelectValue /></SelectTrigger><SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
}

export default function ImportPage() {
  const [table, setTable] = useState<CsvTable | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>({ date: '-1', merchant: '-1', amount: '-1', category: '-1', direction: '-1' })
  const [dateFormat, setDateFormat] = useState('iso')
  const [convention, setConvention] = useState('negative-expense')
  const [fileName, setFileName] = useState('')
  const [fileDigest, setFileDigest] = useState('')
  const [rows, setRows] = useState<ReviewRow[] | null>(null)
  const [pending, setPending] = useState(false)
  const [locked, setLocked] = useState(false)
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<{ count: number; alreadyImported: boolean } | null>(null)
  const [source, setSource] = useState<'csv' | 'pdf'>('csv')
  const [pdfText, setPdfText] = useState('')
  const [skipped, setSkipped] = useState<string[]>([])
  const [pdfChecked, setPdfChecked] = useState(false)
  const { ready } = useMutations<Transaction>('transactions')
  const { user } = useUser()
  const toast = useToast()
  const canWrite = ready && ['member', 'admin'].includes(user?.role ?? '')
  const checked = rows?.filter(r => r.included).map(r => ({ row: r, ...validateReviewRow(r, source) })) ?? []
  const invalid = checked.filter(r => r.errors.length > 0).length

  async function upload(file?: File) {
    if (!file) return
    setMessage(''); setRows(null); setTable(null); setResult(null); setLocked(false); setPending(true); setPdfText(''); setSkipped([]); setPdfChecked(false)
    try {
      const kind = file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : file.name.toLowerCase().endsWith('.csv') ? 'csv' : null
      if (!kind) throw new Error('Choose a CSV or PDF file')
      setSource(kind); setFileName(file.name)
      if (file.size > (kind === 'pdf' ? MAX_PDF_BYTES : MAX_CSV_BYTES)) throw new Error(kind === 'pdf' ? 'PDF must be 10 MB or smaller' : 'CSV must be 2 MB or smaller')
      const buffer = kind === 'pdf' ? await file.arrayBuffer() : null
      const text = kind === 'csv' ? await file.text() : ''
      const digest = buffer ? await digestPdf(buffer) : await digestText(text)
      setFileDigest(digest)
      const saved = await callAction<{ status: string; rows: { rowNumber: number; transaction: TransactionInput }[] } | null>('getCsvImportReview', { fileDigest: digest })
      if (saved?.status === 'saving') {
        setRows(saved.rows.map(r => ({ rowNumber: r.rowNumber, date: r.transaction.date, merchant: r.transaction.merchant, amount: (r.transaction.amountMinor / 100).toFixed(2), category: r.transaction.category, direction: r.transaction.direction, included: true })))
        setLocked(true)
        setPdfChecked(true)
        setMessage('An approved import is unfinished. Resume saving the original reviewed rows below.')
      } else if (saved?.status === 'completed') setResult({ count: saved.rows.length, alreadyImported: true })
      else {
        let next: CsvTable
        if (buffer) {
          const extracted = await extractPdfText(buffer)
          setPdfText(extracted)
          const parsed = parseStatementText(extracted)
          next = parsed.table; setSkipped(parsed.skipped)
          setDateFormat('iso'); setConvention('positive-expense')
        } else next = parseCsv(text)
        setTable(next); setMapping(suggestMapping(next.headers))
      }
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not read this file') }
    finally { setPending(false) }
  }

  function review() {
    if (!table) return
    if (source === 'pdf' && !pdfChecked) { setMessage('Review the extracted text and confirm completeness and USD currency before continuing.'); return }
    try { setRows(buildReview(table, mapping, dateFormat, convention)); setMessage('') }
    catch (e) { setMessage((e as Error).message) }
  }
  function patch(index: number, values: Partial<ReviewRow>) { setRows(current => current?.map((r, i) => i === index ? { ...r, ...values } : r) ?? null) }
  async function save() {
    if (!canWrite || pending || invalid || checked.length === 0) return
    setPending(true); setLocked(true); setMessage('')
    try {
      const saved = await callAction<{ count: number; alreadyImported: boolean }>(source === 'pdf' ? 'commitPdfImport' : 'commitCsvImport', { fileDigest, fileName, rows: checked.map(r => ({ rowNumber: r.row.rowNumber, transaction: r.data! })) })
      setResult(saved)
      toast.success(saved.alreadyImported ? 'File already imported' : 'Import saved', `${saved.count} transactions`)
    } catch (e) { setMessage(`${e instanceof Error ? e.message : 'Save failed'}. You can retry saving this review.`) }
    finally { setPending(false) }
  }

  return <div className="space-y-6 p-6">
    <header><h1 className="text-2xl font-semibold">Import transactions</h1><p className="mt-2 text-sm text-muted-foreground">CSV or text-based PDF → review → save. USD only, up to 200 transactions. CSV: 2 MB. PDF: 10 MB, 20 pages.</p></header>
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <Label htmlFor="csv-file">Transaction CSV</Label><Input id="csv-file" type="file" accept=".csv,text/csv" disabled={pending || !canWrite} onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }} />
      <Label htmlFor="pdf-file">PDF statement</Label><Input id="pdf-file" type="file" accept=".pdf,application/pdf" disabled={pending || !canWrite} onChange={e => { void upload(e.target.files?.[0]); e.target.value = '' }} />
      <a className="inline-block text-sm text-primary underline" href="/demo-statement.pdf" download>Download demo PDF</a>
      <a className="inline-block text-sm text-primary underline" href="/sample-transactions.csv" download>Download sample CSV</a>
      <a className="ml-4 inline-block text-sm text-primary underline" href="/demo-transactions.csv" download>Download demo CSV</a>
      <p className="text-sm text-muted-foreground">The file is parsed in your browser. Only the rows you approve are saved.</p>
    </section>
    {message && <p role="alert" className="rounded-lg border border-border p-4 text-sm">{message}</p>}
    {source === 'pdf' && pdfText && !rows && !result && <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h2 className="text-lg font-semibold">Check extracted statement text</h2>
      <p className="text-sm text-muted-foreground">Supports full YYYY-MM-DD or slash dates with a year, a merchant, and one amount per line. Lines with balances, two dates, or multiple amounts are skipped. No OCR or AI is used. Compare against your original statement; this parser cannot guarantee every transaction was detected.</p>
      <Label htmlFor="pdf-text">Extracted text (editable)</Label><textarea id="pdf-text" className="h-56 w-full rounded-lg border border-input bg-background p-3 font-mono text-sm" maxLength={300000} value={pdfText} onChange={e => { setPdfText(e.target.value); setTable(null); setPdfChecked(false) }} />
      <Button variant="outline" onClick={() => { try { const parsed = parseStatementText(pdfText); setTable(parsed.table); setMapping(suggestMapping(parsed.table.headers)); setSkipped(parsed.skipped); setPdfChecked(false); setMessage('') } catch (e) { setMessage((e as Error).message) } }}>Extract transaction rows</Button>
      {skipped.length > 0 && <details><summary className="cursor-pointer text-sm">{skipped.length} skipped lines — inspect for missing transactions</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs">{skipped.join('\n')}</pre></details>}
      <div className="flex items-start gap-2"><Checkbox id="pdf-checked" aria-label="Confirm PDF review and USD currency" checked={pdfChecked} onCheckedChange={setPdfChecked} /><Label htmlFor="pdf-checked">I compared the extracted rows with my statement, checked skipped lines, and confirm all amounts are USD.</Label></div>
    </section>}
    {result ? <section className="space-y-3 rounded-lg border border-border bg-card p-6"><h2 className="text-lg font-semibold">{result.alreadyImported ? 'This file was already imported' : 'Import complete'}</h2><p>{result.count} transactions. Re-uploading the same file will not add duplicates.</p><Link to="/transactions" className="inline-block text-primary underline">View transactions</Link></section> : table && !rows ?
      <section className="space-y-4 rounded-lg border border-border bg-card p-4"><h2 className="text-lg font-semibold">Map columns — {fileName}</h2><p className="text-sm text-muted-foreground">{table.rows.length} rows found. Check these suggestions before continuing.</p>
        <div className="grid gap-4 sm:grid-cols-2">{(['date', 'merchant', 'amount', 'category', 'direction'] as const).map(key => <Choice key={key} id={`map-${key}`} label={`${key[0].toUpperCase()}${key.slice(1)} column`} value={mapping[key]} options={[{ value: '-1', label: key === 'category' || key === 'direction' ? 'Not in file' : 'Choose column' }, ...table.headers.map((h, i) => ({ value: String(i), label: h }))]} onChange={v => setMapping(current => ({ ...current, [key]: v }))} />)}
          <Choice id="date-format" label="Date format" value={dateFormat} onChange={setDateFormat} options={[{ value: 'iso', label: 'YYYY-MM-DD' }, { value: 'mdy', label: 'MM/DD/YYYY' }, { value: 'dmy', label: 'DD/MM/YYYY' }]} />
          <Choice id="amount-convention" label="Amount convention (when type is absent)" value={convention} onChange={setConvention} options={[{ value: 'negative-expense', label: 'Negative = expense; positive = income' }, { value: 'positive-expense', label: 'Positive = expense; negative = income' }]} />
        </div><Button onClick={review}>Review transactions</Button>
      </section> : rows && <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Review transactions</h2><p className="text-sm text-muted-foreground">{checked.length} selected · {invalid} invalid. Correct values or exclude rows before saving.</p></div><Button variant="outline" disabled={pending || locked} onClick={() => setRows(null)}>Back to mapping</Button></div>
        <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr>{['Include', 'Date', 'Merchant', 'Amount (USD)', 'Type', 'Category', 'Validation'].map(h => <th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row, index) => {
          const errors = validateReviewRow(row, source).errors
          return <tr key={row.rowNumber} data-testid="import-review-row" className="border-t border-border align-top">
            <td className="p-3"><Checkbox aria-label={`Include row ${row.rowNumber}`} checked={row.included} onCheckedChange={v => patch(index, { included: v })} disabled={pending || locked} /></td>
            <td className="min-w-40 p-3"><Input aria-label={`Date row ${row.rowNumber}`} value={row.date} onChange={e => patch(index, { date: e.target.value })} disabled={pending || locked} /></td>
            <td className="min-w-48 p-3"><Input aria-label={`Merchant row ${row.rowNumber}`} value={row.merchant} onChange={e => patch(index, { merchant: e.target.value })} disabled={pending || locked} /></td>
            <td className="min-w-36 p-3"><Input aria-label={`Amount row ${row.rowNumber}`} inputMode="decimal" value={row.amount} onChange={e => patch(index, { amount: e.target.value })} disabled={pending || locked} /></td>
            <td className="min-w-40 p-3"><Choice id={`type-${row.rowNumber}`} label={`Type row ${row.rowNumber}`} value={row.direction} onChange={v => patch(index, { direction: v })} disabled={pending || locked} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} /></td>
            <td className="min-w-48 p-3"><Choice id={`category-${row.rowNumber}`} label={`Category row ${row.rowNumber}`} value={row.category} onChange={v => patch(index, { category: v })} disabled={pending || locked} options={CATEGORIES.map(c => ({ value: c, label: c }))} /></td>
            <td className="min-w-48 p-3">{!row.included ? 'Excluded' : errors.length ? <span className="text-destructive">{errors.join('; ')}</span> : 'Ready'}</td>
          </tr>
        })}</tbody></table></div>
        <Button loading={pending} disabled={!canWrite || checked.length === 0 || invalid > 0} onClick={save}>Approve and save {checked.length} transactions</Button>
        <p className="text-sm text-muted-foreground">Saving may finish in stages. If interrupted, re-upload this file to resume the approved review without duplicating saved rows.</p>
      </section>}
  </div>
}
