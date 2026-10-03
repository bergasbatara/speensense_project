import { describe, expect, it } from 'vitest'
import { dateContext, selectTransactions } from './tools'

describe('assistant calendar context', () => {
  it('uses Eastern dates across the UTC midnight boundary', () => {
    expect(dateContext(new Date('2026-10-01T02:00:00Z'))).toEqual({ today: '2026-09-30', timeZone: 'America/New_York', thisMonth: { from: '2026-09-01', to: '2026-09-30' }, lastMonth: { from: '2026-08-01', to: '2026-08-31' } })
  })
  it('handles year rollover and leap February', () => {
    expect(dateContext(new Date('2024-03-15T12:00:00Z')).lastMonth).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(dateContext(new Date('2026-01-15T12:00:00Z')).lastMonth).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })
})

describe('assistant completeness checks', () => {
  it('refuses truncated and failed query payloads', () => {
    expect(() => selectTransactions({ success: true, data: { records: [], count: 200, truncated: true } }, {})).toThrow('truncated')
    expect(() => selectTransactions({ success: false, error: 'unavailable' }, {})).toThrow('No totals')
  })
  it('refuses a missing page even without a truncation marker', () => {
    expect(() => selectTransactions({ success: true, data: { records: [], count: 1 } }, {})).toThrow('truncated')
  })
})
