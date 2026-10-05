import { test, expect } from '@playwright/test'

test.describe('API tests', () => {
  for (const name of ['createTransaction', 'updateTransaction', 'deleteTransaction', 'listTransactions', 'getSpendingSummary', 'commitCsvImport', 'commitPdfImport', 'commitDraftImport', 'getCsvImportReview', 'proposeCategoryChange', 'approveCategoryChange', 'cancelCategoryChange']) {
    test(`${name} requires authentication`, async ({ request }) => {
      const response = await request.post(`/api/actions/${name}`, { data: {} })
      expect(response.status()).toBe(401)
    })
  }
  test('auth proxy forwards to auth worker', async ({ request }) => {
    const res = await request.get('/api/auth/ok')
    expect(res.ok()).toBeTruthy()
  })

  for (const path of ['/ws/private', '/ws/presence/private', '/ws/canvas/private', '/ws/cron/private', '/ws/jobs/private', '/ws/yjs/private']) {
    test(`${path} rejects anonymous and invalid-token requests`, async ({ request }) => {
      for (const suffix of ['', '?token=invalid', '?userId=forged&role=admin']) {
        const res = await request.get(path + suffix)
        expect(res.status()).toBe(401)
        expect(await res.text()).toBe('Unauthorized')
      }
    })
  }

  test('AI chat rejects a signed-out caller', async ({ request }) => {
    const res = await request.post('/api/ai/chats', { data: {} })
    expect(res.status()).toBe(401)
  })
})
