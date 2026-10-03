// home pattern: data workspace — manual entry and an owner-scoped ledger.
import { useState, type FormEvent } from 'react'
import { useMutations, useQuery, useUser } from 'deepspace'
import { Button, ConfirmModal, EmptyState, Input, Label, Modal, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, useToast } from '@/components/ui'
import { CATEGORIES, formatMoney, matchesTransaction, parseAmount, transactionInput, transactionFilters, type Transaction } from '@/lib/transactions'
import { callAction } from '@/lib/actions-client'

type Row = { recordId: string; data: Transaction }
function localDate() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function TransactionsPage() {
  const { records, status, error: queryError } = useQuery<Transaction>('transactions', { orderBy: 'date', orderDir: 'desc' })
  const { ready } = useMutations<Transaction>('transactions')
  const { user } = useUser()
  const toast = useToast()
  const [editor, setEditor] = useState<Row | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Row | null>(null)
  const [pending, setPending] = useState(false)
  const [merchant, setMerchant] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const canWrite = ready && ['member', 'admin'].includes(user?.role ?? '')
  const filters = transactionFilters.safeParse({ merchant, ...(from ? { from } : {}), ...(to ? { to } : {}) })
  const visible = filters.success ? records.filter(r => matchesTransaction(r.data, filters.data)) : []

  async function remove() {
    if (!deleting || pending) return
    setPending(true)
    try {
      await callAction('deleteTransaction', { recordId: deleting.recordId })
      setDeleting(null)
      toast.success('Transaction deleted')
    } catch (e) { toast.error('Could not delete transaction', e instanceof Error ? e.message : 'Please try again') }
    finally { setPending(false) }
  }

  return <div className="space-y-6 p-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-2xl font-semibold">Transactions</h1><p className="text-sm text-muted-foreground">Review and organize your recorded income and expenses.</p></div>
      <Button disabled={!canWrite} onClick={() => setEditor('new')}>Add transaction</Button>
    </header>
    <div className="grid gap-4 sm:grid-cols-3">
      <div><Label htmlFor="merchant-filter">Search merchant</Label><Input id="merchant-filter" value={merchant} onChange={e => setMerchant(e.target.value)} /></div>
      <div><Label htmlFor="from-filter">From</Label><Input id="from-filter" type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
      <div><Label htmlFor="to-filter">To</Label><Input id="to-filter" type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
    </div>
    {!filters.success && <p role="alert" className="text-destructive">Enter a valid date range.</p>}
    {status === 'loading' && <div aria-label="Loading transactions" className="h-40 animate-pulse rounded-lg bg-muted" />}
    {status === 'error' && <p role="alert" className="text-destructive">Could not load transactions: {queryError}</p>}
    {status === 'ready' && (visible.length === 0 ? <EmptyState title="No transactions yet" description="Add a transaction or adjust your filters." /> :
      <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr>{['Date', 'Merchant', 'Category', 'Amount', 'Actions'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead>
        <tbody>{visible.map(row => <tr key={row.recordId} data-testid="transaction-row" className="border-t border-border">
          <td className="p-3">{row.data.date}</td><td className="p-3">{row.data.merchant}</td><td className="p-3">{row.data.category}</td>
          <td className="whitespace-nowrap p-3 tabular-nums">{row.data.direction === 'income' ? '+' : '−'}{formatMoney(row.data.amountMinor)}</td>
          <td className="flex gap-2 p-3"><Button variant="outline" size="sm" disabled={!canWrite} onClick={() => setEditor(row)} aria-label={`Edit ${row.data.merchant}`}>Edit</Button><Button variant="ghost" size="sm" disabled={!canWrite} onClick={() => setDeleting(row)} aria-label={`Delete ${row.data.merchant}`}>Delete</Button></td>
        </tr>)}</tbody></table></div>)}
    {editor && <TransactionEditor row={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} />}
    <ConfirmModal open={!!deleting} onClose={() => { if (!pending) setDeleting(null) }} onConfirm={remove} title={`Delete ${deleting?.data.merchant ?? 'transaction'}?`} description="This permanently removes the transaction." confirmText="Delete" loading={pending} />
  </div>
}

function TransactionEditor({ row, onClose }: { row?: Row; onClose: () => void }) {
  const [date, setDate] = useState(row?.data.date ?? localDate())
  const [merchant, setMerchant] = useState(row?.data.merchant ?? '')
  const [amount, setAmount] = useState(row ? (row.data.amountMinor / 100).toFixed(2) : '')
  const [category, setCategory] = useState<string>(row?.data.category ?? 'Uncategorized')
  const [direction, setDirection] = useState<string>(row?.data.direction ?? 'expense')
  const [pending, setPending] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const toast = useToast()
  async function save(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    let amountMinor: number
    try { amountMinor = parseAmount(amount) } catch (e) { setErrors({ amount: (e as Error).message }); return }
    const input = transactionInput.safeParse({ date, merchant, amountMinor, category, direction, currency: 'USD', source: row?.data.source ?? 'manual', status: row?.data.status ?? 'confirmed' })
    if (!input.success) { setErrors(Object.fromEntries(input.error.issues.map(i => [i.path[0], i.message]))); return }
    setErrors({})
    setPending(true)
    try {
      if (row) {
        const { source: _source, status: _status, ...patch } = input.data
        await callAction('updateTransaction', { recordId: row.recordId, patch })
      } else await callAction('createTransaction', input.data)
      toast.success(row ? 'Transaction updated' : 'Transaction saved')
      onClose()
    } catch (e) { toast.error('Could not save transaction', e instanceof Error ? e.message : 'Please try again') }
    finally { setPending(false) }
  }
  return <Modal open onClose={pending ? () => undefined : onClose} size="sm">
    <Modal.Header><Modal.Title>{row ? 'Edit transaction' : 'Add transaction'}</Modal.Title></Modal.Header>
    <form onSubmit={save} noValidate><Modal.Body><div className="space-y-4">
      <div><Label htmlFor="transaction-merchant">Merchant</Label><Input id="transaction-merchant" value={merchant} onChange={e => setMerchant(e.target.value)} disabled={pending} />{errors.merchant && <p role="alert" className="text-sm text-destructive">{errors.merchant}</p>}</div>
      <div><Label htmlFor="transaction-date">Date</Label><Input id="transaction-date" type="date" value={date} onChange={e => setDate(e.target.value)} disabled={pending} />{errors.date && <p role="alert" className="text-sm text-destructive">{errors.date}</p>}</div>
      <div><Label htmlFor="transaction-amount">Amount (USD)</Label><Input id="transaction-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} disabled={pending} />{errors.amount && <p role="alert" className="text-sm text-destructive">{errors.amount}</p>}</div>
      <div><Label htmlFor="transaction-direction">Type</Label><Select value={direction} onValueChange={setDirection} disabled={pending}><SelectTrigger id="transaction-direction"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="expense">Expense</SelectItem><SelectItem value="income">Income</SelectItem></SelectContent></Select></div>
      <div><Label htmlFor="transaction-category">Category</Label><Select value={category} onValueChange={setCategory} disabled={pending}><SelectTrigger id="transaction-category"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
    </div></Modal.Body><Modal.Footer><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" loading={pending}>Save transaction</Button></Modal.Footer></form>
  </Modal>
}
