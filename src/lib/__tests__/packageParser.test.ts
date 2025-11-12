import { describe, expect, it } from 'vitest'
import { parsePackageDescription } from '../packageParser'

describe('parsePackageDescription', () => {
  it('parses metered aerosol inhaler packages', () => {
    const description =
      '1 CANISTER in 1 CARTON (80425-0266-1)  / 200 AEROSOL, METERED in 1 CANISTER'
    const parsed = parsePackageDescription(description)
    expect(parsed).toEqual({ size: 200, unit: 'puff' })
  })

  it('parses inhaler device counts', () => {
    const parsed = parsePackageDescription('1 INHALER (200 ACTUATIONS)')
    expect(parsed).toEqual({ size: 1, unit: 'inhaler' })
  })
})

