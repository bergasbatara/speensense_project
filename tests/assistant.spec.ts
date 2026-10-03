import { test, expect } from 'deepspace/testing'

test('assistant tools compute real totals, reject mutations, and isolate users', async ({ users }) => {
  test.setTimeout(90_000)
  const [alice, bob] = await users(2)
  const ids: string[] = []
  const merchant = `__test-${Date.now()}__ Assistant`
  async function request(page: typeof alice.page, path: string, data: unknown) {
    const auth = await page.request.post(path.startsWith('/_deepspace/agent') ? '/api/auth/agent-token' : '/api/auth/token', { data: path.startsWith('/_deepspace/agent') ? { target: 'http://localhost:5180' } : {} })
    const { token } = await auth.json()
    return page.request.post(path, { headers: { Authorization: `Bearer ${token}` }, data })
  }
  const invoke = async (page: typeof alice.page, name: string, input: unknown) => {
    const result = await (await request(page, `/_deepspace/agent/tools/${name}`, { input })).json()
    expect(result.ok, JSON.stringify({ code: result.code, error: result.error })).toBe(true)
    return result
  }
  try {
    for (const entry of [{ amountMinor: 1234, direction: 'expense', category: 'Dining' }, { amountMinor: 566, direction: 'expense', category: 'Groceries' }, { amountMinor: 5000, direction: 'income', category: 'Income' }]) {
      const response = await request(alice.page, '/api/actions/createTransaction', { ...entry, merchant, date: '2091-10-01', source: 'manual', status: 'confirmed', currency: 'USD' })
      const result = await response.json()
      expect(result.success).toBe(true)
      ids.push(result.data.recordId)
    }
    const filters = { from: '2091-10-01', to: '2091-10-01', merchant }
    expect(await invoke(alice.page, 'spending_summary', filters)).toMatchObject({ ok: true, result: { complete: true, expenseMinor: 1800, incomeMinor: 5000, netMinor: 3200, count: 3, expense: '$18.00', netCashFlow: '$32.00', byCategory: { Dining: 1234, Groceries: 566 } } })
    expect(await invoke(bob.page, 'spending_summary', filters)).toMatchObject({ ok: true, result: { expenseMinor: 0, count: 0 } })
    const lookup = await invoke(alice.page, 'transaction_lookup', { ...filters, category: 'Dining' })
    expect(lookup.result.records).toHaveLength(1)
    expect(lookup.result.records[0]).toMatchObject({ recordId: ids[0], amount: '$12.34' })
    expect(lookup.result.records[0]).not.toHaveProperty('userId')
    expect(await invoke(bob.page, 'transaction_lookup', filters)).toMatchObject({ ok: true, result: { records: [], matchingCount: 0 } })
    for (const name of ['records_create', 'records_update', 'records_delete', 'records_query', 'user_current']) {
      expect((await request(alice.page, `/_deepspace/agent/tools/${name}`, { input: {} })).status()).toBe(404)
    }
    expect((await request(alice.page, '/_deepspace/agent/tools/spending_summary', { input: { userId: 'other-user' } })).status()).toBe(400)
    expect((await request(alice.page, '/_deepspace/agent/tools/spending_summary', { input: { from: '2091-11-01', to: '2091-10-01' } })).status()).toBe(400)
    await alice.page.goto('/home')
    await expect(alice.page.getByText('How much did I spend this month?', { exact: true })).toBeVisible()
    if (process.env.SPENDSENSE_LIVE_AI !== 'true') {
      test.info().annotations.push({ type: 'live-ai-unverified', description: 'Live AI generation is opt-in: set SPENDSENSE_LIVE_AI=true after adding account credits.' })
      return
    }
    const auth = await alice.page.request.post('/api/auth/token', { data: {} })
    const { token } = await auth.json()
    const headers = { Authorization: `Bearer ${token}` }
    const chatResponse = await alice.page.request.post('/api/ai/chats', { headers, data: { title: '__test__ Spending assistant' } })
    const { chat } = await chatResponse.json()
    try {
      const stream = await alice.page.request.post('/api/ai/chat', { headers, timeout: 60_000, data: { chatId: chat.recordId, userMessageId: crypto.randomUUID(), content: `Use spending_summary to report spending and income for merchant substring ${merchant} on 2091-10-01. State the totals.` } })
      const body = await stream.text()
      expect(stream.ok(), `Chat returned HTTP ${stream.status()}`).toBe(true)
      const events = body.split('\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6)))
      const errors = events.filter(event => event.type === 'error')
      if (errors.length === 1 && errors[0].errorText === 'Payment Required') {
        test.info().annotations.push({ type: 'live-ai-unverified', description: 'DeepSpace test account has no AI credits; verified the real service returns Payment Required.' })
        expect(events.some(event => event.type === 'tool-output-available')).toBe(false)
      } else {
        expect(errors, JSON.stringify(errors)).toHaveLength(0)
        expect(events.some(event => event.toolName === 'spending_summary')).toBe(true)
        expect(events.filter(event => event.type === 'text-delta').map(event => event.delta).join('')).toContain('18.00')
      }
    } finally {
      await alice.page.request.delete(`/api/ai/chats/${chat.recordId}`, { headers })
    }
  } finally {
    for (const recordId of ids) await request(alice.page, '/api/actions/deleteTransaction', { recordId })
  }
})
