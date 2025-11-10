import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getOpenAIClient } from '$lib/openai'
import { getRxCui } from '$lib/rxnorm'
import { getNdcPackagesByPlainNdc, getNdcPackagesByRxcui } from '$lib/fda'
import { buildCalcResult } from '$lib/quantity'
import { looksLikeNdc, normalizeNdc } from '$lib/ndcUtils'
import { parseSig } from '$lib/sigParser'
import type { CalcRequest, CalcResult } from '$lib/types'

export const POST: RequestHandler = async ({ request, fetch }) => {
  try {
    const payload = (await request.json()) as Partial<CalcRequest>
    const drug = payload.drug?.trim()
    const sig = payload.sig?.trim()
    const days = Number(payload.days)

    if (!drug || !sig || Number.isNaN(days) || days <= 0) {
      return json(
        { success: false, error: 'Provide drug (or NDC), SIG, and days supply (>0).' },
        { status: 400 }
      )
    }

    const warnings: string[] = []
    const openai = getOpenAIClient()

    let packages
    let lookupType: 'ndc' | 'rxnorm' = 'rxnorm'
    let lookupName: string | undefined

    if (looksLikeNdc(drug)) {
      let ndc11: string
      try {
        ndc11 = normalizeNdc(drug)
      } catch (error) {
        return json({ success: false, error: (error as Error).message }, { status: 400 })
      }

      try {
        packages = await getNdcPackagesByPlainNdc(ndc11, fetch)
        lookupType = 'ndc'
        lookupName = packages?.[0]?.productName ?? packages?.[0]?.description ?? packages?.[0]?.labelerName
        if (packages.length === 0) {
          warnings.push(`No FDA packages found for NDC ${ndc11}.`)
        }
      } catch (error) {
        return json(
          { success: false, error: `FDA lookup failed: ${(error as Error).message}` },
          { status: 502 }
        )
      }
    } else {
      const rxnormResult = await getRxCui(drug, fetch, openai ?? undefined)
      warnings.push(...rxnormResult.warnings)

      if (!rxnormResult.rxcui) {
        return json(
          {
            success: false,
            error: 'Unable to resolve RxCUI for drug. Try alternate name or provide NDC directly.',
            warnings
          },
          { status: 404 }
        )
      }

      try {
        packages = await getNdcPackagesByRxcui(rxnormResult.rxcui, fetch)
        lookupName = rxnormResult.name ?? packages?.[0]?.productName ?? packages?.[0]?.description
        if (packages.length === 0) {
          warnings.push(`No FDA packages found for RxCUI ${rxnormResult.rxcui}.`)
        }
      } catch (error) {
        return json(
          { success: false, error: `FDA lookup failed: ${(error as Error).message}` },
          { status: 502 }
        )
      }
    }

    const sigResult = await parseSig(sig, openai ?? undefined)
    warnings.push(...sigResult.warnings)

    if (!sigResult.parsed) {
      return json(
        { success: false, error: 'Unable to parse SIG. Please provide clearer instructions.', warnings },
        { status: 422 }
      )
    }

    const calc = buildCalcResult({
      parsedSig: sigResult.parsed,
      days,
      packages: packages ?? []
    })

    warnings.push(...calc.warnings)

    const result: CalcResult = {
      ...calc,
      warnings,
      parsedSig: sigResult.parsed,
      drugName: lookupName ?? drug,
      json: buildResultJson({
        drug,
        days,
        sig,
        lookupType,
        calc,
        drugName: lookupName ?? drug
      })
    }

    return json({ success: true, data: result })
  } catch (error) {
    console.error('calc error', error)
    return json({ success: false, error: 'Unexpected server error.' }, { status: 500 })
  }
}

function buildResultJson({
  drug,
  days,
  sig,
  lookupType,
  calc,
  drugName
}: {
  drug: string
  days: number
  sig: string
  lookupType: 'ndc' | 'rxnorm'
  calc: Pick<CalcResult, 'ndcs' | 'totalQty' | 'dispensedQty' | 'overfillPct'>
  drugName: string
}): string {
  const payload = {
    input: { drug, sig, days, lookupType },
    drugName,
    totalQuantity: calc.totalQty,
    dispensedQuantity: calc.dispensedQty,
    overfillPercent: Number((calc.overfillPct * 100).toFixed(2)),
    ndcs: calc.ndcs.map((ndc) => ({
      ndc11: ndc.ndc,
      formatted: ndc.formattedNdc,
      packageSize: ndc.size,
      unit: ndc.unit,
      packs: ndc.packs,
      dispensedQty: ndc.dispensedQty,
      inactive: ndc.inactive
    })),
    generatedAt: new Date().toISOString()
  }

  return JSON.stringify(payload, null, 2)
}

