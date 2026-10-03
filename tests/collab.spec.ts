/**
 * Multi-user collaboration spec — verifies two users sign in into
 * separate browser contexts and the app distinguishes them.
 *
 * `users(2)` takes any two accounts from your pool, so this spec passes on a
 * fresh app with no setup beyond having two test accounts:
 *   npx deepspace test accounts list
 *   npx deepspace test accounts create --email a@deepspace.test --name "A" --password-stdin
 *
 * Ask for accounts *by name* (`users(['Alice', 'Bob'])`) only when the
 * behaviour under test depends on which identity acts — otherwise naming them
 * couples the spec to one machine's pool.
 *
 * The `users` fixture handles sign-in caching (per-account storageState
 * persisted to `~/.deepspace/playwright-states/`), context creation, and
 * cleanup. No need to manage browser contexts manually.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

// A machine that has never created test accounts is the normal state of a
// fresh checkout, and there `users()` throws — turning "you have no pool yet"
// into three red tests about the app, which it is not. Skip the file instead
// and say what creates the pool. The count is of accounts usable HERE: the
// pool is global per developer, but passwords live only on the machine that
// created the account.
const usableTestAccounts = loadAllTestAccounts().length
test.skip(
  usableTestAccounts < 2,
  `Needs 2 usable test accounts, found ${usableTestAccounts}. Create them with ` +
    '`npx deepspace test accounts create --email <name>@deepspace.test --name "<name>" ' +
    '--password-stdin`, or fetch existing pool accounts with `npx deepspace test accounts recover --all`.',
)

test('transaction CRUD persists and stays private between two accounts', async ({ users }) => {
  const [alice, bob] = await users(2)
  const merchant = `__test-${Date.now()}__ Coffee`
  await Promise.all([alice.page.goto('/transactions'), bob.page.goto('/transactions')])
  await expect(alice.page.getByRole('heading', { name: 'Transactions', exact: true })).toBeVisible()
  await alice.page.getByRole('button', { name: 'Add transaction' }).click()
  await alice.page.getByLabel('Merchant', { exact: true }).fill(merchant)
  await alice.page.getByLabel('Amount (USD)').fill('12.50')
  await alice.page.getByRole('button', { name: 'Save transaction' }).click()
  const row = alice.page.getByTestId('transaction-row').filter({ hasText: merchant })
  try {
    await expect(row).toContainText('$12.50')
    async function action(page: typeof alice.page, name: string, data: unknown) {
      const auth = await page.request.post('/api/auth/token', { data: {} })
      const { token } = await auth.json()
      const response = await page.request.post(`/api/actions/${name}`, {
        headers: { Authorization: `Bearer ${token}` }, data,
      })
      return response.json()
    }
    const listing = await action(alice.page, 'listTransactions', { merchant })
    expect(listing.success).toBe(true)
    expect(listing.data.records).toHaveLength(1)
    const recordId = listing.data.records[0].recordId
    for (const name of ['updateTransaction', 'deleteTransaction']) {
      const denied = await action(bob.page, name, name === 'updateTransaction'
        ? { recordId, patch: { amountMinor: 1 } } : { recordId })
      expect(denied).toMatchObject({ success: false, error: 'Transaction not found' })
    }
    const otherListing = await action(bob.page, 'listTransactions', { merchant })
    expect(otherListing.data.records).toHaveLength(0)
    const invalid = await action(alice.page, 'updateTransaction', { recordId, patch: { amountMinor: 1.5 } })
    expect(invalid.success).toBe(false)
    const forged = await action(alice.page, 'updateTransaction', { recordId, patch: { userId: 'forged-owner' } })
    expect(forged.success).toBe(false)
    const summary = await action(alice.page, 'getSpendingSummary', { merchant })
    expect(summary).toMatchObject({ success: true, data: { expenseMinor: 1250, incomeMinor: 0, count: 1 } })
    const otherSummary = await action(bob.page, 'getSpendingSummary', { merchant })
    expect(otherSummary).toMatchObject({ success: true, data: { expenseMinor: 0, count: 0 } })
    await alice.page.reload()
    await expect(row).toContainText('$12.50')
    await expect(bob.page.getByRole('heading', { name: 'Transactions', exact: true })).toBeVisible()
    await expect(bob.page.getByTestId('transaction-row').filter({ hasText: merchant })).toHaveCount(0)
    await alice.page.getByRole('button', { name: `Edit ${merchant}`, exact: true }).click()
    await alice.page.getByLabel('Amount (USD)').fill('20.29')
    await alice.page.getByRole('button', { name: 'Save transaction' }).click()
    await expect(row).toContainText('$20.29')
  } finally {
    await alice.page.getByRole('button', { name: `Delete ${merchant}`, exact: true }).click()
    await alice.page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(row).toHaveCount(0)
  }
})

test('dashboard totals filters and category chart update live and stay private', async ({ users }) => {
  const [alice, bob] = await users(2)
  const created: string[] = []
  const marker = `__test-${Date.now()}__ Dashboard`
  async function action(page: typeof alice.page, name: string, data: unknown) {
    const auth = await page.request.post('/api/auth/token', { data: {} })
    const { token } = await auth.json()
    const response = await page.request.post(`/api/actions/${name}`, { headers: { Authorization: `Bearer ${token}` }, data })
    return response.json()
  }
  try {
    for (const entry of [{ amountMinor: 1500, category: 'Dining', direction: 'expense' }, { amountMinor: 500, category: 'Groceries', direction: 'expense' }, { amountMinor: 5000, category: 'Income', direction: 'income' }]) {
      const result = await action(alice.page, 'createTransaction', { ...entry, date: '2090-10-02', merchant: marker, currency: 'USD', source: 'manual', status: 'confirmed' })
      expect(result.success).toBe(true)
      created.push(result.data.recordId)
    }
    await Promise.all([alice.page.goto('/home'), bob.page.goto('/home')])
    for (const page of [alice.page, bob.page]) {
      await page.getByLabel('From date', { exact: true }).fill('2090-10-02')
      await page.getByLabel('To date', { exact: true }).fill('2090-10-02')
    }
    await expect(alice.page.getByTestId('dashboard-spending')).toHaveText('$20.00')
    await expect(alice.page.getByTestId('dashboard-income')).toHaveText('$50.00')
    await expect(alice.page.getByTestId('dashboard-net')).toHaveText('$30.00')
    await expect(alice.page.getByTestId('dashboard-category-row').filter({ hasText: 'Dining' })).toContainText('75.0%')
    await expect(bob.page.getByTestId('dashboard-spending')).toHaveText('$0.00')
    await expect(bob.page.getByTestId('dashboard-transaction-row').filter({ hasText: marker })).toHaveCount(0)
    await alice.page.getByLabel('Category', { exact: true }).click()
    await alice.page.getByRole('option', { name: 'Dining', exact: true }).click()
    await expect(alice.page.getByTestId('dashboard-spending')).toHaveText('$15.00')
    await expect(alice.page.getByTestId('dashboard-income')).toHaveText('$0.00')
    await alice.page.getByLabel('Category', { exact: true }).click()
    await alice.page.getByRole('option', { name: 'All categories' }).click()
    const updated = await action(alice.page, 'updateTransaction', { recordId: created[0], patch: { amountMinor: 2000, category: 'Groceries' } })
    expect(updated.success).toBe(true)
    await expect(alice.page.getByTestId('dashboard-spending')).toHaveText('$25.00')
    await expect(alice.page.getByTestId('dashboard-category-row')).toHaveCount(1)
    await expect(alice.page.getByTestId('dashboard-category-row')).toContainText('Groceries')
    await alice.page.screenshot({ path: '.deepspace/dashboard-desktop.png', fullPage: true, animations: 'disabled' })
    await alice.page.setViewportSize({ width: 390, height: 844 })
    await expect(alice.page.getByRole('dialog', { name: 'Assistant', exact: true })).toHaveCount(0)
    await expect(alice.page.getByTestId('dashboard-spending')).toBeVisible()
    await alice.page.screenshot({ path: '.deepspace/dashboard-mobile.png', fullPage: true, animations: 'disabled' })
    await alice.page.getByLabel('From date', { exact: true }).fill('2090-10-03')
    await expect(alice.page.getByRole('alert')).toContainText('start date before the end date')
    await expect(alice.page.getByTestId('dashboard-spending')).toHaveCount(0)
  } finally {
    for (const recordId of created) await action(alice.page, 'deleteTransaction', { recordId })
  }
})

test('CSV review corrects and excludes rows, saves privately, and prevents replay duplicates', async ({ users }) => {
  const [alice, bob] = await users(2)
  const marker = `__test-${Date.now()}__ Import`
  const csv = `Date,Description,Amount\n2026-10-02,"${marker}, cafe",-12.50\n2026-02-30,${marker} market,-5.75\n2026-10-02,${marker} excluded,-9.99\n`
  await alice.page.goto('/import')
  await expect(alice.page.getByRole('heading', { name: 'Import CSV', exact: true })).toBeVisible()
  await alice.page.getByLabel('Transaction CSV', { exact: true }).setInputFiles({ name: `${marker}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await alice.page.getByRole('button', { name: 'Review transactions' }).click()
  await expect(alice.page.getByRole('button', { name: 'Approve and save 3 transactions' })).toBeDisabled()
  await alice.page.getByLabel('Date row 3', { exact: true }).fill('2026-10-03')
  await alice.page.getByRole('checkbox', { name: 'Include row 4' }).uncheck()
  await alice.page.getByRole('button', { name: 'Approve and save 2 transactions' }).click()
  await expect(alice.page.getByRole('heading', { name: 'Import complete' })).toBeVisible()
  async function action(page: typeof alice.page, name: string, data: unknown) {
    const auth = await page.request.post('/api/auth/token', { data: {} })
    const { token } = await auth.json()
    const response = await page.request.post(`/api/actions/${name}`, { headers: { Authorization: `Bearer ${token}` }, data })
    return response.json()
  }
  const listing = await action(alice.page, 'listTransactions', { merchant: marker })
  try {
    expect(listing.data.records).toHaveLength(2)
    expect(listing.data.records.every((r: { data: { source: string } }) => r.data.source === 'csv')).toBe(true)
    expect(await action(alice.page, 'getSpendingSummary', { merchant: marker })).toMatchObject({ success: true, data: { expenseMinor: 1825, count: 2 } })
    expect((await action(bob.page, 'listTransactions', { merchant: marker })).data.records).toHaveLength(0)
    const digest = await alice.page.evaluate(async text => {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
      return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
    }, csv)
    const review = await action(alice.page, 'getCsvImportReview', { fileDigest: digest })
    expect(review.data.status).toBe('completed')
    expect((await action(bob.page, 'getCsvImportReview', { fileDigest: digest })).data).toBeNull()
    const body = { fileDigest: digest, fileName: `${marker}.csv`, rows: review.data.rows }
    const invalid = { ...body, fileDigest: 'b'.repeat(64), rows: [{ ...body.rows[0], transaction: { ...body.rows[0].transaction, amountMinor: 1.005 } }] }
    expect((await action(alice.page, 'commitCsvImport', invalid)).success).toBe(false)
    const retries = await Promise.all([action(alice.page, 'commitCsvImport', body), action(alice.page, 'commitCsvImport', body)])
    expect(retries.every(r => r.success && r.data.alreadyImported)).toBe(true)
    expect((await action(alice.page, 'listTransactions', { merchant: marker })).data.records).toHaveLength(2)
    await alice.page.getByLabel('Transaction CSV', { exact: true }).setInputFiles({ name: 'renamed.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await expect(alice.page.getByRole('heading', { name: 'This file was already imported' })).toBeVisible()
  } finally {
    for (const record of listing.data.records) await action(alice.page, 'deleteTransaction', { recordId: record.recordId })
  }
})

test('each browser renders its own signed-in account', async ({ users }) => {
  const [a, b] = await users(2)

  // /home is dynamic (under src/pages/(app)/), so it mounts the nav shell;
  // '/' is the static landing and has no navigation.
  await Promise.all([a.page.goto('/home'), b.page.goto('/home')])

  // Email, not name. The page renders the *session's* `name || email`, while
  // `user.name` here comes from the LOCAL account registry — and the two are
  // not the same fact: a display name is optional, and an account recovered on
  // another machine has none stored locally at all. The email is the credential
  // the context signed in with, so it is the one identity both sides agree on,
  // and asserting it proves the page is showing THIS browser's account.
  // The two accounts are distinct, so two exact matches is also the proof that
  // the contexts are not sharing one session.
  for (const user of [a, b]) {
    await expect(user.page.getByTestId('app-navigation')).toBeVisible({ timeout: 15_000 })
    await expect(user.page.getByRole('heading', { name: 'Spending overview' })).toBeVisible()
    await expect(user.page.getByTestId('auth-overlay')).toHaveCount(0)

    // The identity chip shows `name || email`. Its text is not predictable, but
    // its presence is: something must be there once the profile has loaded.
    // (It is `hidden sm:inline` in some templates, so assert text, not
    // visibility.)
    await expect(user.page.getByTestId('nav-user-name')).toHaveText(/\S/, { timeout: 15_000 })

    await user.page.getByRole('button', { name: 'Account menu' }).click()
    await expect(user.page.getByTestId('nav-user-email')).toHaveText(user.email, {
      timeout: 15_000,
    })
  }
})

test('sign-out leaves the private workspace and removes account state', async ({ users }) => {
  // Use a dedicated session, then refresh the fixture cache: signing out a
  // shared cached session otherwise strands later tests at the auth gate.
  const [user] = await users(1, { force: true })
  try {
  await user.page.goto('/home')
  await expect(user.page.getByRole('heading', { name: 'Spending overview' })).toBeVisible()
  await user.page.getByRole('button', { name: 'Account menu' }).click()
  await user.page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(user.page).toHaveURL(/\/$/)
  await expect(user.page.getByTestId('static-landing')).toBeVisible()
  await user.page.goto('/home')
  await expect(user.page.getByTestId('auth-overlay')).toBeVisible()
  await expect(user.page.getByTestId('nav-user-email')).toHaveCount(0)
  } finally {
    await users(1, { force: true })
  }
})

test('API status page renders loading success and error states', async ({ users }) => {
  const [user] = await users(1)
  let shouldFail = false
  let requestCount = 0
  let releaseCatalog!: () => void
  const catalogGate = new Promise<void>(resolve => { releaseCatalog = resolve })

  await user.page.route('**/api/integrations', async (route) => {
    requestCount += 1
    if (shouldFail) {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Catalog unavailable' }),
      })
      return
    }

    await catalogGate
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { integrations: { openai: {}, wikipedia: {} } } }),
    })
  })

  await user.page.goto('/api-status')
  await expect(user.page.getByText('Loading integration catalog...')).toBeVisible()
  releaseCatalog()
  await expect(user.page.getByText('Integration catalog ready')).toBeVisible()
  await expect(user.page.getByText('2 integrations available.')).toBeVisible()

  shouldFail = true
  await user.page.getByRole('button', { name: 'Refresh' }).click()
  await expect(user.page.getByText('Catalog unavailable')).toBeVisible()
  await expect(user.page.getByText('Showing the last loaded catalog')).toBeVisible()
  await expect(user.page.getByText('Integration catalog ready')).toBeVisible()

  const urlAfterFailure = user.page.url()
  const requestsAfterFailure = requestCount
  await user.page.getByRole('button', { name: 'Refresh' }).click()
  await expect.poll(() => requestCount).toBeGreaterThan(requestsAfterFailure)
  expect(user.page.url()).toBe(urlAfterFailure)
})

test('API status page shows local retry after first-load API failure', async ({ users }) => {
  const [user] = await users(1)
  let requestCount = 0

  await user.page.route('**/api/integrations', async (route) => {
    requestCount += 1
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'Catalog unavailable' }),
    })
  })

  await user.page.goto('/api-status')
  await expect(user.page.getByText('Loading integration catalog...')).toBeVisible()
  await expect(user.page.getByText('Could not load API data')).toBeVisible()
  await expect(user.page.getByText('Retried 1 time automatically.')).toBeVisible()

  const retryButton = user.page.getByRole('button', { name: 'Retry' })
  await expect(retryButton).toBeVisible()

  const urlAfterFailure = user.page.url()
  const requestsAfterFailure = requestCount
  await retryButton.click()
  await expect.poll(() => requestCount).toBeGreaterThan(requestsAfterFailure)
  expect(user.page.url()).toBe(urlAfterFailure)
})
