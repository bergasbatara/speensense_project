/* home pattern: data-forward — live spending totals, categories, and recent transactions */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from 'deepspace'
import { Button, EmptyState, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui'
import { CATEGORIES, formatMoney, transactionFilters, type Transaction } from '@/lib/transactions'
import { dashboardData, monthRange } from '@/lib/dashboard'

export default function HomePage() {
  const { records, status, error } = useQuery<Transaction>('transactions', { orderBy: 'date', orderDir: 'desc' })
  const navigate = useNavigate()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [category, setCategory] = useState('all')
  const filters = transactionFilters.safeParse({ ...(from ? { from } : {}), ...(to ? { to } : {}), ...(category !== 'all' ? { category } : {}) })
  let data: ReturnType<typeof dashboardData> | null = null
  let calculationError = ''
  if (status === 'ready' && filters.success) {
    try { data = dashboardData(records, filters.data) }
    catch { calculationError = 'Unable to calculate totals. Check your transaction records and try again.' }
  }
  function period(offset?: number) {
    const range = offset === undefined ? { from: '', to: '' } : monthRange(offset)
    setFrom(range.from); setTo(range.to)
  }
  return <div className="space-y-6 p-4 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold tracking-tight">Spending overview</h1><p className="mt-1 text-sm text-muted-foreground">Your confirmed transactions, understood at a glance.</p></div>
      <Button onClick={() => navigate('/import')}>Import transactions</Button>
    </header>
    <section aria-label="Dashboard filters" className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => period()}>All time</Button><Button variant="outline" size="sm" onClick={() => period(0)}>This month</Button><Button variant="outline" size="sm" onClick={() => period(-1)}>Last month</Button></div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><Label htmlFor="dashboard-from">From date</Label><Input id="dashboard-from" type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><Label htmlFor="dashboard-to">To date</Label><Input id="dashboard-to" type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        <div><Label htmlFor="dashboard-category">Category</Label><Select value={category} onValueChange={setCategory}><SelectTrigger id="dashboard-category"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{CATEGORIES.map(c => <SelectItem value={c} key={c}>{c}</SelectItem>)}</SelectContent></Select></div>
      </div>
      {!filters.success && <p role="alert" className="text-sm text-destructive">Enter valid dates with the start date before the end date.</p>}
    </section>
    {status === 'loading' && <div aria-label="Loading dashboard" className="grid gap-4 sm:grid-cols-3">{[1, 2, 3].map(i => <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />)}</div>}
    {(status === 'error' || calculationError) && <p role="alert" className="rounded-lg border border-border p-4 text-destructive">{calculationError || `Could not load your transactions: ${error}`}</p>}
    {data && <>
      <section aria-label="Financial totals" className="grid gap-4 sm:grid-cols-3">
        {[{ label: 'Total spending', value: data.summary.expenseMinor, id: 'dashboard-spending' }, { label: 'Total income', value: data.summary.incomeMinor, id: 'dashboard-income' }, { label: 'Net cash flow', value: data.summary.netMinor, id: 'dashboard-net' }].map(card => <div key={card.id} className="rounded-lg border border-border bg-card p-5"><p className="text-sm text-muted-foreground">{card.label}</p><p data-testid={card.id} className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{formatMoney(card.value)}</p></div>)}
      </section>
      <p className="text-sm text-muted-foreground">{data.summary.count} confirmed {data.summary.count === 1 ? 'transaction' : 'transactions'} · USD · Net cash flow is income minus expenses for this selection.</p>
      {data.summary.count === 0 ? <EmptyState title="No transactions in this selection" description={records.length ? 'Change your filters to see more transactions.' : 'Import a CSV or text-based PDF, or add a transaction to start tracking spending.'} action={{ label: 'Import transactions', onClick: () => navigate('/import') }} secondaryAction={{ label: 'Add transaction', onClick: () => navigate('/transactions') }} /> :
        <div className="grid gap-6 2xl:grid-cols-5">
          <section className="space-y-5 rounded-lg border border-border bg-card p-5 2xl:col-span-2" aria-label="Spending by category"><h2 className="text-lg font-semibold">Spending by category</h2>
            {data.categories.length === 0 ? <p className="text-sm text-muted-foreground">No expenses in this selection.</p> : data.categories.map(c => <div key={c.category} data-testid="dashboard-category-row"><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span>{c.category}</span><span className="tabular-nums">{formatMoney(c.amountMinor)} <span className="text-muted-foreground">({c.share.toFixed(1)}%)</span></span></div><div role="meter" aria-label={c.category} aria-valuenow={c.share} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${formatMoney(c.amountMinor)}, ${c.share.toFixed(1)} percent of spending`} className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${c.share}%` }} /></div></div>)}
          </section>
          <section className="min-w-0 rounded-lg border border-border bg-card 2xl:col-span-3"><div className="flex items-center justify-between gap-3 p-5"><h2 className="text-lg font-semibold">Recent transactions</h2><Link to="/transactions" className="text-sm text-primary underline-offset-4 hover:underline">View all</Link></div>
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted"><tr>{['Date', 'Merchant', 'Category', 'Amount'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{data.recent.map(row => <tr key={row.recordId} data-testid="dashboard-transaction-row" className="border-t border-border"><td className="whitespace-nowrap p-3">{row.data.date}</td><td className="p-3">{row.data.merchant}</td><td className="p-3 text-muted-foreground">{row.data.category}</td><td className="whitespace-nowrap p-3 tabular-nums">{row.data.direction === 'income' ? '+' : '−'}{formatMoney(row.data.amountMinor)}</td></tr>)}</tbody></table></div>
          </section>
        </div>}
    </>}
  </div>
}
