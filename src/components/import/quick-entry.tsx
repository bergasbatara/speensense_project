import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Checkbox, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, useToast } from '@/components/ui'
import { digestText, validateReviewRow, type ReviewRow } from '@/lib/csv-import'
import { digestPdf } from '@/lib/pdf-import'
import { CATEGORIES, type TransactionInput } from '@/lib/transactions'
import { callAction } from '@/lib/actions-client'
import { MAX_ENTRY_TEXT, MAX_RECEIPT_TEXT, parseDescription, parseReceiptText } from '@/lib/quick-entry'
import { recognizeReceipt } from '@/lib/receipt-ocr'

type Kind = 'manual' | 'image'
export function QuickEntry({ canWrite }: { canWrite: boolean }) {
  const [kind, setKind] = useState<Kind>('manual')
  const [description, setDescription] = useState('')
  const [receiptText, setReceiptText] = useState('')
  const [dateFormat, setDateFormat] = useState<'mdy' | 'dmy'>('mdy')
  const [receiptDigest, setReceiptDigest] = useState('')
  const [preview, setPreview] = useState('')
  const [draft, setDraft] = useState<ReviewRow | null>(null)
  const [digest, setDigest] = useState('')
  const [notes, setNotes] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState('')
  const [pending, setPending] = useState(false)
  const [locked, setLocked] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [complete, setComplete] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const toast = useToast()
  useEffect(() => () => { controller.current?.abort() }, [])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  const validation = draft ? validateReviewRow(draft, kind) : { errors: [] }
  function reset() { setDraft(null); setNotes([]); setMessage(''); setConfirmed(false); setComplete(false); setLocked(false) }
  function patch(values: Partial<ReviewRow>) { setDraft(current => current ? { ...current, ...values } : null); setConfirmed(false) }
  async function readPhoto(file?: File) {
    if (!file) return
    reset(); setReceiptText(''); setReceiptDigest(''); setPreview(''); setPending(true); setProgress('Reading receipt photo…')
    const abort = new AbortController(); controller.current = abort
    try {
      const text = await recognizeReceipt(file, abort.signal, setProgress)
      if (abort.signal.aborted) return
      setReceiptDigest(await digestPdf(await file.arrayBuffer()))
      setReceiptText(text); setPreview(URL.createObjectURL(file))
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not read receipt photo.') }
    finally { setPending(false); setProgress(''); controller.current = null }
  }
  async function prepare() {
    if (pending || !canWrite) return
    reset(); setPending(true)
    try {
      const parsed = kind === 'manual' ? parseDescription(description) : parseReceiptText(receiptText, dateFormat)
      const key = await digestText(kind === 'manual' ? `description:${parsed.row.date}:${description.trim()}` : `receipt:${receiptDigest || receiptText.trim()}`)
      setDigest(key)
      const saved = await callAction<{ status: string; rows: { transaction: TransactionInput }[] } | null>('getCsvImportReview', { fileDigest: key })
      if (saved?.status === 'completed') { setComplete(true); setMessage('This input was already saved. No duplicate was added.'); return }
      if (saved?.status === 'saving') {
        const transaction = saved.rows[0].transaction
        setDraft({ rowNumber: 2, date: transaction.date, merchant: transaction.merchant, amount: (transaction.amountMinor / 100).toFixed(2), category: transaction.category, direction: transaction.direction, included: true })
        setLocked(true); setConfirmed(true); setNotes(['An approved save is unfinished. Resume the original review below.'])
      } else { setDraft(parsed.row); setNotes(parsed.notes) }
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not prepare a draft.') }
    finally { setPending(false) }
  }
  async function save() {
    if (!canWrite || pending || !draft || !confirmed || !validation.data) return
    setPending(true); setLocked(true); setMessage('')
    try {
      await callAction('commitDraftImport', { fileDigest: digest, fileName: kind === 'image' ? 'Receipt' : 'Description', rows: [{ rowNumber: 2, transaction: validation.data }] })
      setComplete(true); setDraft(null); toast.success('Transaction saved')
    } catch (e) { setMessage(`${e instanceof Error ? e.message : 'Could not save'}. Retry the same approved draft.`) }
    finally { setPending(false) }
  }
  return <section className="space-y-4 rounded-lg border border-border bg-card p-4" aria-labelledby="quick-entry-heading">
    <div><h2 id="quick-entry-heading" className="text-lg font-semibold">Receipt & quick entry</h2><p className="mt-1 text-sm text-muted-foreground">Turn a receipt photo or a short description into one transaction. Review it before saving. No AI credits needed.</p></div>
    <div className="flex flex-wrap gap-2"><Button variant={kind === 'manual' ? 'default' : 'outline'} disabled={pending} onClick={() => { setKind('manual'); reset() }}>Describe a transaction</Button><Button variant={kind === 'image' ? 'default' : 'outline'} disabled={pending} onClick={() => { setKind('image'); reset() }}>Read a receipt</Button></div>
    {!complete && <>
      {kind === 'manual' ? <div className="space-y-2"><Label htmlFor="entry-description">Transaction description</Label><textarea id="entry-description" className="min-h-24 w-full rounded-lg border border-input bg-background p-3 text-sm" value={description} maxLength={MAX_ENTRY_TEXT} disabled={pending || locked || !canWrite} onChange={e => { setDescription(e.target.value); reset() }} placeholder="Spent $12.50 at Starbucks yesterday" /><p className="text-sm text-muted-foreground">Use “Spent $12.50 at Starbucks yesterday” or “Received $2500 from Employer on 2026-10-01”. Supports today, yesterday, or a full YYYY-MM-DD date. Without a date, uses today in your browser's local time.</p></div> : <div className="space-y-3">
        <div><Label htmlFor="receipt-photo">Receipt photo</Label><Input id="receipt-photo" type="file" accept="image/png,image/jpeg,image/webp" disabled={pending || locked || !canWrite} onChange={e => { void readPhoto(e.target.files?.[0]); e.target.value = '' }} /></div>
        <p className="text-sm text-muted-foreground">English receipts, PNG/JPEG/WebP, up to 10 MB and 12 megapixels. Take a clear, upright photo. OCR runs on your device; the photo and full receipt text are not uploaded.</p>
        <a className="inline-block text-sm text-primary underline" href="/demo-receipt.png" download>Download demo receipt</a>
        {preview && <img src={preview} alt="Receipt being reviewed" className="max-h-72 max-w-full rounded-lg border border-border object-contain" />}
        <div><Label htmlFor="receipt-text">Receipt text (editable)</Label><textarea id="receipt-text" className="h-40 w-full rounded-lg border border-input bg-background p-3 font-mono text-sm" value={receiptText} maxLength={MAX_RECEIPT_TEXT} disabled={pending || locked || !canWrite} onChange={e => { setReceiptText(e.target.value); reset() }} placeholder={'Paste receipt text, or upload a photo above.\nCafe Example\n2026-10-05\nTOTAL $12.50'} /></div>
        <div><Label htmlFor="receipt-date-format">Receipt date format</Label><Select value={dateFormat} disabled={pending || locked} onValueChange={value => { setDateFormat(value as 'mdy' | 'dmy'); reset() }}><SelectTrigger id="receipt-date-format"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mdy">MM/DD/YYYY</SelectItem><SelectItem value="dmy">DD/MM/YYYY</SelectItem></SelectContent></Select></div>
        <p className="text-sm text-muted-foreground">ISO dates work too. Only an explicit final total is suggested; check that it includes tax and any tip. Missing or conflicting values need your correction.</p>
      </div>}
      {!locked && <Button variant="outline" disabled={pending || !canWrite || !(kind === 'manual' ? description.trim() : receiptText.trim())} onClick={prepare}>Prepare transaction draft</Button>}
    </>}
    {progress && <div className="flex flex-wrap items-center gap-3"><p role="status" className="text-sm">{progress}</p><Button variant="outline" onClick={() => controller.current?.abort()}>Cancel receipt reading</Button></div>}
    {message && <p role="alert" className="text-sm">{message}</p>}
    {draft && <div className="space-y-4 rounded-lg border border-border p-4">
      <h3 className="font-semibold">Review transaction draft</h3>
      {notes.map(note => <p key={note} className="text-sm text-muted-foreground">{note}</p>)}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="draft-merchant">Draft merchant</Label><Input id="draft-merchant" value={draft.merchant} disabled={pending || locked} onChange={e => patch({ merchant: e.target.value })} /></div>
        <div><Label htmlFor="draft-date">Draft date</Label><Input id="draft-date" type="date" value={draft.date} disabled={pending || locked} onChange={e => patch({ date: e.target.value })} /></div>
        <div><Label htmlFor="draft-amount">Draft amount (USD)</Label><Input id="draft-amount" inputMode="decimal" value={draft.amount} disabled={pending || locked} onChange={e => patch({ amount: e.target.value })} /></div>
        <div><Label htmlFor="draft-type">Draft type</Label><Select value={draft.direction} disabled={pending || locked} onValueChange={direction => patch({ direction })}><SelectTrigger id="draft-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="expense">Expense</SelectItem><SelectItem value="income">Income</SelectItem></SelectContent></Select></div>
        <div><Label htmlFor="draft-category">Draft category</Label><Select value={draft.category} disabled={pending || locked} onValueChange={category => patch({ category })}><SelectTrigger id="draft-category"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(category => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></div>
      </div>
      {validation.errors.length > 0 && <p role="alert" className="text-sm text-destructive">{validation.errors.join('; ')}</p>}
      <div className="flex items-start gap-2"><Checkbox id="draft-confirm" checked={confirmed} disabled={pending || locked} onCheckedChange={setConfirmed} /><Label htmlFor="draft-confirm">I checked the merchant, date, final amount, type, category, and USD currency.</Label></div>
      <Button disabled={pending || !canWrite || !confirmed || validation.errors.length > 0} loading={pending} onClick={save}>Approve and save transaction</Button>
    </div>}
    {complete && <div className="space-y-2"><h3 className="font-semibold">Transaction draft saved</h3><Link to="/transactions" className="text-sm text-primary underline">View transactions</Link><div><Button variant="outline" onClick={() => { reset(); setDescription(''); setReceiptText(''); setReceiptDigest(''); setPreview('') }}>Start another entry</Button></div></div>}
  </section>
}
