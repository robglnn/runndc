import { calculateOverfill, guidanceForQuantity } from './ndcUtils'
import type { CalcResult, NdcPackage, ParsedSig, SelectedNdc } from './types'

interface QuantityOptions {
  parsedSig: ParsedSig
  days: number
  packages: NdcPackage[]
}

export function buildCalcResult({
  parsedSig,
  days,
  packages
}: QuantityOptions): Pick<CalcResult, 'ndcs' | 'totalQty' | 'dispensedQty' | 'overfillPct' | 'warnings'> {
  const warnings: string[] = []
  const totalQty = Number((parsedSig.dose * parsedSig.frequencyPerDay * days).toFixed(2))

  if (!Number.isFinite(totalQty) || totalQty <= 0) {
    throw new Error('Calculated quantity must be greater than zero.')
  }

  const selections = packages
    .filter((pkg) => pkg.size > 0)
    .map<SelectedNdc>((pkg) => {
      const packs = Math.max(1, Math.ceil(totalQty / pkg.size))
      const dispensedQty = packs * pkg.size
      const overfillPct = calculateOverfill(totalQty, dispensedQty)
      return {
        ...pkg,
        packs,
        dispensedQty,
        overfillPct
      }
    })
    .sort((a, b) => {
      if (a.inactive !== b.inactive) return a.inactive ? 1 : -1
      if (a.overfillPct !== b.overfillPct) return a.overfillPct - b.overfillPct
      return a.dispensedQty - b.dispensedQty
    })

  if (selections.length === 0) {
    warnings.push('No FDA NDC packages match this drug. Verify RxCUI or input NDC directly.')
    return {
      ndcs: [],
      totalQty,
      dispensedQty: 0,
      overfillPct: 0,
      warnings
    }
  }

  const primary = selections[0]
  const overfillPct = Number((primary.overfillPct * 100).toFixed(2))
  const guidance = guidanceForQuantity(totalQty)

  if (primary.inactive) {
    warnings.push(`Recommended NDC ${primary.formattedNdc} is inactive. Select an alternate package.`)
  }

  // FDA overage warnings deactivated per user request
  // if (primary.overfillPct > 0.12) {
  //   warnings.push(
  //     `Overfill ${overfillPct}% exceeds 12% tolerance. FDA guidance (${guidance?.notes ?? '2011 allowance'})
  //  recommends limiting excess fill. Consider alternative packaging or manual adjustment.`
  //   )
  // } else if (guidance) {
  //   warnings.push(`FDA 2011 overage guidance: ${guidance.notes}`)
  // }

  return {
    ndcs: selections.slice(0, 5),
    totalQty,
    dispensedQty: primary.dispensedQty,
    overfillPct: Number(primary.overfillPct.toFixed(4)),
    warnings
  }
}

