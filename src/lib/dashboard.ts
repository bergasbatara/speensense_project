import { matchesTransaction, summarizeTransactions, transactionInput, transactionFilters, type TransactionFilters, type Transaction } from './transactions'

export function dashboardData(records: { recordId: string; data: Transaction }[], filters: TransactionFilters) {
  const checkedFilters = transactionFilters.parse(filters)
  const rows = records.map(record => {
    const { userId: _userId, ...input } = record.data
    return { recordId: record.recordId, data: transactionInput.parse(input) }
  }).filter(r => r.data.status === 'confirmed' && matchesTransaction(r.data, checkedFilters))
  const summary = summarizeTransactions(rows.map(r => r.data))
  const categories = Object.entries(summary.byCategory).sort((a, b) => b[1] - a[1]).map(([category, amountMinor]) => ({ category, amountMinor, share: summary.expenseMinor ? amountMinor / summary.expenseMinor * 100 : 0 }))
  return { summary, categories, recent: rows.sort((a, b) => b.data.date.localeCompare(a.data.date)).slice(0, 10) }
}

export function monthRange(offset: number, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  const format = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return { from: format(start), to: format(end) }
}
