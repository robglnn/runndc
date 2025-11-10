import { describe, expect, it } from 'vitest'
import { parseSig } from '../sigParser'

describe('parseSig', () => {
  it('parses standard tablet instructions', async () => {
    const { parsed, warnings } = await parseSig('Take 1 tablet twice daily')
    expect(parsed).not.toBeNull()
    expect(parsed?.dose).toBe(1)
    expect(parsed?.frequencyPerDay).toBe(2)
    expect(parsed?.unit).toBe('tablet')
    expect(parsed?.prn).toBe(false)
    expect(warnings).toHaveLength(0)
  })

  it('detects PRN warnings', async () => {
    const { parsed, warnings } = await parseSig('Take 1 capsule every 6 hours as needed (PRN)')
    expect(parsed?.frequencyPerDay).toBeCloseTo(4)
    expect(warnings.some((warning) => warning.includes('PRN'))).toBe(true)
  })

  it('returns null when unable to parse without OpenAI', async () => {
    const { parsed, warnings } = await parseSig('Use as directed')
    expect(parsed).toBeNull()
    expect(warnings.length).toBeGreaterThan(0)
  })
})

