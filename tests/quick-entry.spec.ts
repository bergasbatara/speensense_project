import { test, expect } from 'deepspace/testing'
test('descriptions and real receipt OCR require review, save private rows, and prevent duplicates', async ({ users }) => {
  test.setTimeout(120_000)
  const [alice, bob] = await users(2)
  await Promise.all([alice.page.goto('/import'), bob.page.goto('/transactions')])
  const merchant = `__test-${Date.now()}__ Quick Entry`
  const ids: string[] = []
  async function action(page: typeof alice.page, name: string, data: unknown) {
    const auth = await page.request.post('/api/auth/token', { data: {} })
    const { token } = await auth.json()
    return (await page.request.post(`/api/actions/${name}`, { headers: { Authorization: `Bearer ${token}` }, data })).json()
  }
  try {
    await expect(alice.page.getByRole('button', { name: 'Describe a transaction', exact: true })).toBeEnabled()
    await alice.page.getByLabel('Transaction description', { exact: true }).fill(`Spent $12.50 at ${merchant} on 2094-10-01`)
    await alice.page.getByRole('button', { name: 'Prepare transaction draft' }).click()
    await expect(alice.page.getByLabel('Draft amount (USD)', { exact: true })).toHaveValue('12.50')
    expect((await action(alice.page, 'listTransactions', { merchant })).data.records).toHaveLength(0)
    await expect(alice.page.getByRole('button', { name: 'Approve and save transaction', exact: true })).toBeDisabled()
    await alice.page.getByLabel('Draft amount (USD)', { exact: true }).fill('13.25')
    await alice.page.getByRole('checkbox', { name: /I checked the merchant, date, final amount/ }).click()
    await alice.page.getByRole('button', { name: 'Approve and save transaction', exact: true }).click()
    await expect(alice.page.getByRole('heading', { name: 'Transaction draft saved' })).toBeVisible()
    let rows = (await action(alice.page, 'listTransactions', { merchant })).data.records
    ids.push(...rows.map((r: { recordId: string }) => r.recordId))
    expect(rows).toHaveLength(1)
    expect(rows[0].data).toMatchObject({ amountMinor: 1325, source: 'manual' })
    await alice.page.getByRole('button', { name: 'Start another entry' }).click()
    await alice.page.getByLabel('Transaction description', { exact: true }).fill(`Spent $12.50 at ${merchant} on 2094-10-01`)
    await alice.page.getByRole('button', { name: 'Prepare transaction draft' }).click()
    await expect(alice.page.getByRole('alert').filter({ hasText: 'This input was already saved' })).toBeVisible()
    await alice.page.getByRole('button', { name: 'Read a receipt', exact: true }).click()
    const demo = await alice.page.request.get('/demo-receipt.png')
    expect(demo.status()).toBe(200)
    const encoded = await alice.page.evaluate(label => {
      const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 760
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 600, 760); ctx.fillStyle = '#111'; ctx.font = '30px Arial';
      ['CAFE EXAMPLE', '2026-10-05', 'USD', 'Coffee 10.00', 'SUBTOTAL 10.00', 'TAX 2.50', 'TOTAL $12.50', 'THANK YOU', label].forEach((line, i) => ctx.fillText(line, 40, 65 + i * 70))
      return canvas.toDataURL('image/png').split(',')[1]
    }, merchant)
    const buffer = Buffer.from(encoded, 'base64')
    await alice.page.getByLabel('Receipt photo', { exact: true }).setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer })
    await expect(alice.page.getByLabel('Receipt text (editable)', { exact: true })).toHaveValue(/TOTAL.*12\.50/, { timeout: 90_000 })
    await alice.page.getByRole('button', { name: 'Prepare transaction draft' }).click()
    await expect(alice.page.getByLabel('Draft amount (USD)', { exact: true })).toHaveValue('12.50')
    await expect(alice.page.getByLabel('Draft date', { exact: true })).toHaveValue('2026-10-05')
    await alice.page.getByLabel('Draft merchant', { exact: true }).fill(merchant)
    await alice.page.getByRole('checkbox', { name: /I checked the merchant, date, final amount/ }).click()
    await alice.page.getByRole('button', { name: 'Approve and save transaction', exact: true }).click()
    await expect(alice.page.getByRole('heading', { name: 'Transaction draft saved' })).toBeVisible()
    rows = (await action(alice.page, 'listTransactions', { merchant })).data.records
    ids.push(...rows.map((r: { recordId: string }) => r.recordId).filter((id: string) => !ids.includes(id)))
    expect(rows).toHaveLength(2)
    expect(rows.find((r: { data: { source: string } }) => r.data.source === 'image').data.amountMinor).toBe(1250)
    expect((await action(bob.page, 'listTransactions', { merchant })).data.records).toHaveLength(0)
    const invalid = await action(alice.page, 'commitDraftImport', { fileDigest: 'b'.repeat(64), fileName: 'Receipt', rows: [{ rowNumber: 2, transaction: { ...rows[0].data, userId: undefined, source: 'csv' } }] })
    expect(invalid.success).toBe(false)
    await alice.page.getByRole('button', { name: 'Start another entry' }).click()
    await alice.page.getByLabel('Receipt photo', { exact: true }).setInputFiles({ name: 'renamed.png', mimeType: 'image/png', buffer })
    await expect(alice.page.getByLabel('Receipt text (editable)', { exact: true })).toHaveValue(/TOTAL.*12\.50/, { timeout: 90_000 })
    await alice.page.getByRole('button', { name: 'Prepare transaction draft' }).click()
    await expect(alice.page.getByRole('alert').filter({ hasText: 'This input was already saved' })).toBeVisible()
    expect((await action(alice.page, 'listTransactions', { merchant })).data.records).toHaveLength(2)
  } finally {
    for (const recordId of ids) await action(alice.page, 'deleteTransaction', { recordId })
  }
})

test('receipt text with missing fields stays editable and cannot be approved', async ({ users }) => {
  const [user] = await users(1)
  await user.page.goto('/import')
  await user.page.getByRole('button', { name: 'Read a receipt', exact: true }).click()
  await user.page.getByLabel('Receipt text (editable)', { exact: true }).fill('Cafe Example\nSUBTOTAL 10.00\nTOTAL 10.00\nGRAND TOTAL 12.50')
  await user.page.getByRole('button', { name: 'Prepare transaction draft' }).click()
  await expect(user.page.getByLabel('Draft date', { exact: true })).toHaveValue('')
  await expect(user.page.getByLabel('Draft amount (USD)', { exact: true })).toHaveValue('')
  await user.page.getByRole('checkbox', { name: /I checked the merchant, date, final amount/ }).click()
  await expect(user.page.getByRole('button', { name: 'Approve and save transaction', exact: true })).toBeDisabled()
  await user.page.getByLabel('Draft date', { exact: true }).fill('2026-10-05')
  await user.page.getByLabel('Draft amount (USD)', { exact: true }).fill('12.50')
  await expect(user.page.getByRole('checkbox', { name: /I checked the merchant, date, final amount/ })).not.toBeChecked()
  await user.page.getByRole('checkbox', { name: /I checked the merchant, date, final amount/ }).click()
  await expect(user.page.getByRole('button', { name: 'Approve and save transaction', exact: true })).toBeEnabled()
  await user.page.getByLabel('Receipt text (editable)', { exact: true }).fill('Cafe Example\nTOTAL 10.00 CAD')
  await user.page.getByRole('button', { name: 'Prepare transaction draft' }).click()
  await expect(user.page.getByRole('alert').filter({ hasText: 'Only USD entries' })).toBeVisible()
  await expect(user.page.getByRole('heading', { name: 'Review transaction draft' })).toHaveCount(0)
})
