import { describe, expect, it } from 'vitest'
import { buildCalcResult } from '../quantity'
import type { NdcPackage, ParsedSig } from '../types'

const baseSig: ParsedSig = {
  dose: 1,
  unit: 'tablet',
  frequencyPerDay: 1,
  prn: false,
  source: 'regex'
}

const activePackage: NdcPackage = {
  ndc: '01234567890',
  formattedNdc: '01234-5678-90',
  size: 30,
  unit: 'tablet',
  inactive: false,
  description: 'Bottle of 30 tablets'
}

const inactivePackage: NdcPackage = {
  ...activePackage,
  ndc: '12345678901',
  formattedNdc: '12345-6789-01',
  size: 60,
  inactive: true
}

describe('buildCalcResult', () => {
  it('prefers active package with minimal overfill', () => {
    const result = buildCalcResult({
      parsedSig: baseSig,
      days: 30,
      packages: [activePackage, inactivePackage]
    })

    expect(result.totalQty).toBe(30)
    expect(result.ndcs[0]?.ndc).toBe(activePackage.ndc)
    expect(result.overfillPct).toBe(0)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('warns when overfill exceeds threshold', () => {
    const largePackage: NdcPackage = {
      ...activePackage,
      ndc: '23456789012',
      formattedNdc: '23456-7890-12',
      size: 100
    }

    const result = buildCalcResult({
      parsedSig: baseSig,
      days: 30,
      packages: [largePackage]
    })

    expect(result.ndcs[0]?.overfillPct).toBeCloseTo((100 - 30) / 30)
    expect(result.warnings.some((warning) => warning.includes('Overfill'))).toBe(true)
  })

  it('returns warning when no packages available', () => {
    const result = buildCalcResult({
      parsedSig: baseSig,
      days: 30,
      packages: []
    })

    expect(result.ndcs).toHaveLength(0)
    expect(result.warnings[0]).toMatch(/No FDA NDC packages/)
  })
})

