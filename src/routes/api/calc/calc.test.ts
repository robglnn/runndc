import { describe, expect, it, vi } from 'vitest'
import { POST } from './+server'

vi.mock('$env/static/private', () => ({ OPENAI_API_KEY: '' }))

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/calc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

describe('api/calc', () => {
  it('handles drug name flow with RxNorm lookup', async () => {
    const response = await POST({
      request: makeRequest({ drug: 'Lasix', sig: '1 tablet twice daily', days: 30 }),
      fetch
    } as unknown as Parameters<typeof POST>[0])

    expect(response.status).toBe(200)
    const payload = (await response.json()) as any
    expect(payload.success).toBe(true)
    expect(payload.data.totalQty).toBe(60)
    expect(payload.data.ndcs[0].formattedNdc).toBe('12345-6789-01')
    expect(payload.data.drugName).toContain('Lasix')
    expect(Array.isArray(payload.data.warnings)).toBe(true)
  })

  it('handles direct NDC input flow', async () => {
    const response = await POST({
      request: makeRequest({ drug: '77777-123-01', sig: '1 tablet daily', days: 30 }),
      fetch
    } as unknown as Parameters<typeof POST>[0])

    expect(response.status).toBe(200)
    const payload = (await response.json()) as any
    expect(payload.success).toBe(true)
    expect(payload.data.totalQty).toBe(30)
    expect(payload.data.ndcs[0].formattedNdc).toBe('77777-0123-01')
    expect(payload.data.drugName).toContain('Demo Drug')
  })
})

