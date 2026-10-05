import { test, expect } from 'deepspace/testing'
import { statementPdf } from './helpers/pdf'

test('PDF extraction saves reviewed private rows and prevents duplicates', async ({ users }) => {
  test.setTimeout(90_000)
  const [alice, bob] = await users(2)
  const merchant = `__test-${Date.now()}__ PDF Cafe`
  await Promise.all([alice.page.goto('/import'), bob.page.goto('/transactions')])
  const pdf = statementPdf(['Synthetic statement USD', `2094-10-01 ${merchant} 12.50 DR`, `2094-10-02 ${merchant} 5.00 DR`, `2094-10-03 ${merchant} 50.00 CR`, '2094-10-04 Ambiguous 20.00 500.00'])
  async function action(page: typeof alice.page, name: string, data: unknown) {
    const auth = await page.request.post('/api/auth/token', { data: {} })
    const { token } = await auth.json()
    return (await page.request.post(`/api/actions/${name}`, { headers: { Authorization: `Bearer ${token}` }, data })).json()
  }
  const ids: string[] = []
  try {
    await alice.page.getByLabel('PDF statement', { exact: true }).setInputFiles({ name: 'statement.pdf', mimeType: 'application/pdf', buffer: pdf })
    await expect(alice.page.getByRole('heading', { name: 'Check extracted statement text' })).toBeVisible()
    await expect(alice.page.getByLabel('Extracted text (editable)')).toHaveValue(new RegExp(merchant))
    await expect(alice.page.getByText('2 skipped lines — inspect for missing transactions')).toBeVisible()
    await alice.page.getByRole('button', { name: 'Review transactions', exact: true }).click()
    await expect(alice.page.getByRole('alert')).toContainText('confirm completeness')
    await alice.page.getByRole('checkbox', { name: /I compared the extracted rows with my statement/ }).click({ timeout: 10_000 })
    await alice.page.getByRole('button', { name: 'Review transactions', exact: true }).click()
    await expect(alice.page.getByTestId('import-review-row')).toHaveCount(3)
    await alice.page.getByLabel('Amount row 2', { exact: true }).fill('13.25')
    await alice.page.getByLabel('Include row 3', { exact: true }).click()
    await alice.page.getByRole('button', { name: 'Approve and save 2 transactions' }).click()
    await expect(alice.page.getByRole('heading', { name: 'Import complete' })).toBeVisible()
    const listing = await action(alice.page, 'listTransactions', { merchant })
    ids.push(...listing.data.records.map((record: { recordId: string }) => record.recordId))
    expect(listing.data.records).toHaveLength(2)
    expect(listing.data.records.every((record: { data: { source: string } }) => record.data.source === 'pdf')).toBe(true)
    expect((await action(alice.page, 'getSpendingSummary', { merchant })).data).toMatchObject({ expenseMinor: 1325, incomeMinor: 5000, count: 2 })
    expect((await action(bob.page, 'listTransactions', { merchant })).data.records).toHaveLength(0)
    await alice.page.getByLabel('PDF statement', { exact: true }).setInputFiles({ name: 'renamed.pdf', mimeType: 'application/pdf', buffer: pdf })
    await expect(alice.page.getByRole('heading', { name: 'This file was already imported' })).toBeVisible()
    expect((await action(alice.page, 'listTransactions', { merchant })).data.records).toHaveLength(2)
    const sourceMismatch = await action(alice.page, 'commitCsvImport', { fileName: 'x.csv', fileDigest: 'a'.repeat(64), rows: [{ rowNumber: 2, transaction: { date: '2094-10-01', merchant, amountMinor: 100, source: 'pdf', status: 'confirmed', currency: 'USD', category: 'Dining', direction: 'expense' } }] })
    expect(sourceMismatch.success).toBe(false)
    await alice.page.getByLabel('PDF statement', { exact: true }).setInputFiles({ name: 'scanned.pdf', mimeType: 'application/pdf', buffer: statementPdf([]) })
    await expect(alice.page.getByRole('alert').filter({ hasText: 'no selectable text' })).toBeVisible()
  } finally {
    for (const recordId of ids) await action(alice.page, 'deleteTransaction', { recordId })
  }
})
