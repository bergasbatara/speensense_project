// home pattern: data workspace — saved category reviews and action history.
import { useState, type FormEvent } from 'react'
import { useQuery, useMutations, useUser } from 'deepspace'
import { Button, Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, EmptyState, useToast } from '@/components/ui'
import { callAction } from '@/lib/actions-client'
import { CATEGORIES, formatMoney, summarizeTransactions } from '@/lib/transactions'
import type { Proposal } from '@/lib/proposals'

export default function ActionsPage() {
  const { records, status, error } = useQuery<Proposal>('proposals', { orderBy: 'createdAt', orderDir: 'desc' })
  const { ready } = useMutations('proposals')
  const { user } = useUser()
  const canWrite = ready && ['member', 'admin'].includes(user?.role ?? '')
  const toast = useToast()
  const [merchant, setMerchant] = useState('')
  const [category, setCategory] = useState('Coffee & Drinks')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function prepare(event: FormEvent) {
    event.preventDefault()
    if (busy || !canWrite) return
    setBusy(true); setMessage('')
    try {
      await callAction('proposeCategoryChange', { category, filters: { merchant, ...(from ? { from } : {}), ...(to ? { to } : {}) } })
      toast.success('Review prepared', 'Inspect the transactions below, then approve or cancel.')
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not prepare review') }
    finally { setBusy(false) }
  }

  return <div className="space-y-6 p-6">
    <header><h1 className="text-2xl font-semibold">Actions</h1><p className="mt-1 text-sm text-muted-foreground">Review category changes and keep a history of your decisions.</p></header>
    <form onSubmit={prepare} className="space-y-4 rounded-lg border border-border bg-card p-4">
      <h2 className="font-semibold">Prepare a category review</h2>
      <p className="text-sm text-muted-foreground">Matches confirmed transactions whose merchant contains your search, regardless of capitalization. Up to 100 changes; reviews expire after 24 hours.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="proposal-merchant">Merchant contains</Label><Input id="proposal-merchant" required maxLength={200} value={merchant} onChange={e => setMerchant(e.target.value)} disabled={busy} /></div>
        <div><Label htmlFor="proposal-category">New category</Label><Select value={category} onValueChange={setCategory} disabled={busy}><SelectTrigger id="proposal-category"><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="proposal-from">From date</Label><Input id="proposal-from" type="date" value={from} onChange={e => setFrom(e.target.value)} disabled={busy} /></div>
        <div><Label htmlFor="proposal-to">To date</Label><Input id="proposal-to" type="date" value={to} onChange={e => setTo(e.target.value)} disabled={busy} /></div>
      </div>
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
      <Button type="submit" loading={busy} disabled={!canWrite || !merchant.trim()}>Prepare review</Button>
    </form>
    {status === 'loading' && <p>Loading action history…</p>}
    {status === 'error' && <p role="alert" className="text-destructive">Could not load actions: {error}</p>}
    {status === 'ready' && !records.length && <EmptyState title="No category reviews yet" description="Ask the assistant to propose changes, or prepare a review above." />}
    {records.map(record => <Review key={record.recordId} id={record.recordId} proposal={record.data} canWrite={canWrite} />)}
  </div>
}

function Review({ id, proposal, canWrite }: { id: string; proposal: Proposal; canWrite: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const toast = useToast()
  const summary = summarizeTransactions(proposal.rows.map(row => row.before))
  const pending = proposal.status === 'pending' || proposal.status === 'applying'
  async function decide(approve: boolean) {
    if (busy || !canWrite) return
    setBusy(true); setError('')
    try {
      await callAction(approve ? 'approveCategoryChange' : 'cancelCategoryChange', { proposalId: id })
      toast.success(approve ? 'Category changes approved' : 'Review cancelled')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save decision') }
    finally { setBusy(false) }
  }
  return <section data-testid="category-review" className="space-y-4 rounded-lg border border-border bg-card p-4">
    <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{proposal.rows.length} {proposal.rows.length === 1 ? 'transaction' : 'transactions'} → {proposal.category}</h2><span data-testid="proposal-status" className="text-sm capitalize">{proposal.status}</span></div>
    <p className="text-sm text-muted-foreground">Spending {formatMoney(summary.expenseMinor)} · Income {formatMoney(summary.incomeMinor)} · Prepared {new Date(proposal.createdAt).toLocaleString()}</p>
    {proposal.status === 'applying' && <p className="text-sm">{proposal.appliedIds.length} changes saved. Retry approval to finish.</p>}
    {proposal.status === 'stale' && <p className="text-sm text-muted-foreground">This review expired or its transactions changed. Prepare a new review.</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Date', 'Merchant', 'Amount', 'Category at review', 'Proposed category'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{proposal.rows.map(row => <tr key={row.recordId} className="border-t border-border"><td className="whitespace-nowrap p-2">{row.before.date}</td><td className="p-2">{row.before.merchant}</td><td className="whitespace-nowrap p-2">{row.before.direction === 'income' ? '+' : '−'}{formatMoney(row.before.amountMinor)}</td><td className="p-2">{row.before.category}</td><td className="p-2">{proposal.category}</td></tr>)}</tbody></table></div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {pending && <div className="flex gap-3"><Button loading={busy} disabled={!canWrite} onClick={() => decide(true)}>{proposal.status === 'applying' ? 'Retry approval' : 'Approve changes'}</Button><Button variant="outline" disabled={busy || !canWrite || proposal.status !== 'pending'} onClick={() => decide(false)}>Cancel proposal</Button></div>}
  </section>
}
