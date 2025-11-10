import { describe, expect, it } from 'vitest'
import {
  normalizeNdc,
  formatNdc11,
  calculateOverfill,
  guidanceForQuantity,
  looksLikeNdc
} from '../ndcUtils'

describe('normalizeNdc', () => {
  it('pads 4-4-2 format to 11 digits', () => {
    expect(normalizeNdc('1234-5678-90')).toBe('01234567890')
  })

  it('inserts zero for 5-3-2 format', () => {
    expect(normalizeNdc('50242-040-62')).toBe('50242004062')
  })

  it('pads package segment for 5-4-1 format', () => {
    expect(normalizeNdc('12345-6789-1')).toBe('12345678901')
  })

  it('passes through 11-digit inputs', () => {
    expect(normalizeNdc('12345678901')).toBe('12345678901')
  })

  it('rejects non-digit inputs', () => {
    expect(() => normalizeNdc('abc')).toThrow()
  })
})

describe('formatNdc11', () => {
  it('formats 11-digit string to 5-4-2', () => {
    expect(formatNdc11('01234567890')).toBe('01234-5678-90')
  })

  it('throws on invalid length', () => {
    expect(() => formatNdc11('123')).toThrow()
  })
})

describe('looksLikeNdc', () => {
  it('detects hyphenated NDCs', () => {
    expect(looksLikeNdc('12345-6789-01')).toBe(true)
  })

  it('rejects non numeric strings', () => {
    expect(looksLikeNdc('hello')).toBe(false)
  })
})

describe('calculateOverfill', () => {
  it('handles perfect match', () => {
    expect(calculateOverfill(30, 30)).toBe(0)
  })

  it('computes positive overfill', () => {
    expect(calculateOverfill(30, 36)).toBeCloseTo(0.2)
  })
})

describe('guidanceForQuantity', () => {
  it('returns ranges', () => {
    expect(guidanceForQuantity(25)?.allowanceUnits).toBe(1)
    expect(guidanceForQuantity(350)?.allowanceUnits).toBe(2)
    expect(guidanceForQuantity(600)?.allowancePercent).toBeCloseTo(0.5)
  })
})

