import { test, expect } from 'deepspace/testing'

test('category reviews require approval, remain private, reject stale edits, and replay safely', async ({ users }) => {
  test.setTimeout(90_000)
  const [alice, bob] = await users(2)
  const merchant = `__test-${Date.now()}__ Starbucks`
  const ids: string[] = []
  async function action(page: typeof alice.page, name: string, data: unknown) {
    const auth = await page.request.post('/api/auth/token', { data: {} })
    const { token } = await auth.json()
    return (await page.request.post(`/api/actions/${name}`, { headers: { Authorization: `Bearer ${token}` }, data })).json()
  }
  const proposal = async () => {
    const result = await action(alice.page, 'proposeCategoryChange', { filters: { merchant }, category: 'Coffee & Drinks' })
    expect(result.success).toBe(true)
    return result.data.recordId as string
  }
  const listing = async () => (await action(alice.page, 'listTransactions', { merchant })).data.records
  try {
    for (const amountMinor of [1250, 500]) {
      const result = await action(alice.page, 'createTransaction', { merchant, date: '2092-10-03', amountMinor, category: 'Dining', direction: 'expense', currency: 'USD', source: 'manual', status: 'confirmed' })
      expect(result.success).toBe(true); ids.push(result.data.recordId)
    }
    // The model can propose, but cannot approve or directly modify the ledger.
    const auth = await alice.page.request.post('/api/auth/agent-token', { data: { target: 'http://localhost:5180' } })
    const { token } = await auth.json()
    const toolHeaders = { Authorization: `Bearer ${token}` }
    const preview = await alice.page.request.post('/_deepspace/agent/tools/propose_category_change', { headers: toolHeaders, data: { input: { filters: { merchant }, category: 'Coffee & Drinks' } } })
    expect(await preview.json()).toMatchObject({ ok: true, result: { requiresApproval: true, count: 2 } })
    for (const name of ['approve_category_change', 'approveCategoryChange', 'records_update']) {
      expect((await alice.page.request.post(`/_deepspace/agent/tools/${name}`, { headers: toolHeaders, data: { input: {} } })).status()).toBe(404)
    }
    expect((await listing()).every((row: { data: { category: string } }) => row.data.category === 'Dining')).toBe(true)
    const cancelled = await proposal()
    expect(await action(bob.page, 'approveCategoryChange', { proposalId: cancelled })).toMatchObject({ success: false, error: 'Proposal not found' })
    expect(await action(bob.page, 'cancelCategoryChange', { proposalId: cancelled })).toMatchObject({ success: false, error: 'Proposal not found' })
    expect((await action(alice.page, 'cancelCategoryChange', { proposalId: cancelled })).success).toBe(true)
    expect((await action(alice.page, 'approveCategoryChange', { proposalId: cancelled })).success).toBe(false)
    const stale = await proposal()
    expect((await action(alice.page, 'updateTransaction', { recordId: ids[0], patch: { amountMinor: 1300 } })).success).toBe(true)
    expect(await action(alice.page, 'approveCategoryChange', { proposalId: stale })).toMatchObject({ success: false, error: 'A reviewed transaction changed. Prepare a new review before approving.' })
    expect((await listing()).every((row: { data: { category: string } }) => row.data.category === 'Dining')).toBe(true)
    expect((await action(alice.page, 'approveCategoryChange', { proposalId: stale, category: 'Other' })).success).toBe(false)
    // Exercise the visible review workflow and realtime status.
    await Promise.all([alice.page.goto('/actions'), bob.page.goto('/actions')])
    await alice.page.getByLabel('Merchant contains', { exact: true }).fill(merchant)
    await alice.page.getByRole('button', { name: 'Prepare review', exact: true }).click()
    const review = alice.page.getByTestId('category-review').filter({ hasText: merchant }).filter({ has: alice.page.getByTestId('proposal-status').filter({ hasText: 'pending' }) })
    await expect(review).toHaveCount(1)
    await expect(review).toContainText('$18.00')
    await expect(review).toContainText('Dining')
    await alice.page.screenshot({ path: '.deepspace/actions-review.png', fullPage: true, animations: 'disabled' })
    await expect(bob.page.getByTestId('category-review').filter({ hasText: merchant })).toHaveCount(0)
    await review.getByRole('button', { name: 'Approve changes', exact: true }).click()
    await expect(alice.page.getByTestId('category-review').filter({ hasText: merchant }).filter({ has: alice.page.getByTestId('proposal-status').filter({ hasText: 'approved' }) })).toHaveCount(1)
    const rows = await listing()
    expect(rows.every((row: { data: { category: string } }) => row.data.category === 'Coffee & Drinks')).toBe(true)
    expect((await action(alice.page, 'getSpendingSummary', { merchant })).data.expenseMinor).toBe(1800)
    await alice.page.reload()
    await expect(alice.page.getByTestId('category-review').filter({ hasText: merchant }).filter({ has: alice.page.getByTestId('proposal-status').filter({ hasText: 'approved' }) })).toHaveCount(1)
    // Concurrent replay is idempotent after resetting and preparing a new review.
    for (const recordId of ids) await action(alice.page, 'updateTransaction', { recordId, patch: { category: 'Dining' } })
    const replay = await proposal()
    const decisions = await Promise.all([action(alice.page, 'approveCategoryChange', { proposalId: replay }), action(alice.page, 'approveCategoryChange', { proposalId: replay })])
    expect(decisions.every(result => result.success)).toBe(true)
    expect(decisions.filter(result => result.data.alreadyApproved)).toHaveLength(1)
  } finally {
    for (const recordId of ids) await action(alice.page, 'deleteTransaction', { recordId })
  }
})
