import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getOpenAIClient } from '$lib/openai'
import { getRxCui } from '$lib/rxnorm'
import { getNdcPackagesByPlainNdc, getNdcPackagesByRxcui } from '$lib/fda'
import type { FdaIssue } from '$lib/fda'
import { buildCalcResult } from '$lib/quantity'
import { formatNdc11, looksLikeNdc, normalizeNdc } from '$lib/ndcUtils'
import { parseSig } from '$lib/sigParser'
import type { CalcRequest, CalcResult, NdcPackage, UnparsedPackage } from '$lib/types'
import { suggestNdcViaAi } from '$lib/ai/ndcSuggestion'
import type { AiSuggestionResult } from '$lib/ai/ndcSuggestion'
import { parsePackageDescription } from '$lib/packageParser'

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
    let fdaIssues: FdaIssue[] = []
    let unparsedPackages: UnparsedPackage[] = []
    let lookupType: 'ndc' | 'rxnorm' | 'ai' = 'rxnorm'
    let lookupName: string | undefined
    let aiSuggestion: CalcResult['aiSuggestion'] | null = null

    if (looksLikeNdc(drug)) {
      let ndc11: string
      try {
        ndc11 = normalizeNdc(drug)
      } catch (error) {
        return json({ success: false, error: (error as Error).message }, { status: 400 })
      }

      try {
        const result = await getNdcPackagesByPlainNdc(ndc11, fetch)
        packages = result.packages
        fdaIssues = result.issues
        unparsedPackages = result.unparsedPackages
        lookupType = 'ndc'
        lookupName =
          packages?.find((pkg) => pkg.productName)?.productName ??
          packages?.[0]?.labelerName ??
          undefined
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
        const result = await getNdcPackagesByRxcui(rxnormResult.rxcui, fetch)
        packages = result.packages
        fdaIssues = result.issues
        unparsedPackages = result.unparsedPackages
        lookupName =
          rxnormResult.name ??
          packages?.find((pkg) => pkg.productName)?.productName ??
          packages?.[0]?.labelerName ??
          undefined
      } catch (error) {
        return json(
          { success: false, error: `FDA lookup failed: ${(error as Error).message}` },
          { status: 502 }
        )
      }
    }

    if (!packages || packages.length === 0) {
      console.info('[calc] invoking AI fallback', { drug, sig, days })
      const aiResult = await suggestNdcViaAi({ drug, sig, days })
      if (aiResult) {
        aiSuggestion = {
          productNdc: aiResult.product.productNdc,
          rationale: aiResult.rationale,
          confidence: aiResult.confidence
        }

        const converted = convertAiPackages(aiResult.product)
        if (converted.packages.length > 0) {
          packages = converted.packages
          lookupType = 'ai'
          lookupName =
            lookupName ??
            aiResult.product.genericName ??
            aiResult.product.brandName ??
            aiResult.product.productNdc
          console.info('[calc] AI fallback produced packages', {
            productNdc: aiResult.product.productNdc,
            packageCount: packages.length
          })
          // AI suggestion warning deactivated per user request
          // warnings.push(
          //   `AI suggested product ${aiResult.product.productNdc}. ${aiResult.rationale}`
          // )
          if (converted.issues.length) {
            fdaIssues = [...fdaIssues, ...converted.issues]
          }
          if (converted.unparsed.length) {
            unparsedPackages = [...unparsedPackages, ...converted.unparsed]
          }
          if (converted.issues.length || converted.unparsed.length) {
            console.info('[calc] AI fallback packages had issues', {
              issues: converted.issues,
              unparsedCount: converted.unparsed.length
            })
          }
        } else {
          // AI suggestion warning deactivated per user request
          // warnings.push(
          //   `AI suggested product ${aiResult.product.productNdc} but its packages could not be parsed. ${aiResult.rationale}`
          // )
        }
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

    const calcResult = buildCalcResult({
      parsedSig: sigResult.parsed,
      days,
      packages: packages ?? []
    })

    const priority = { inactive: 0, unsupported_unit: 1, no_packages: 2 } as const
    const inactiveIssues = fdaIssues
      .filter((issue) => issue.type === 'inactive')
      .map((issue) => ({
        ndc: issue.ndc ?? drug,
        expiry: issue.description ?? undefined
      }))

    const issueMessages = [...fdaIssues]
      .sort(
        (a, b) =>
          ((priority as Record<string, number>)[a.type] ?? 99) -
          ((priority as Record<string, number>)[b.type] ?? 99)
      )
      .map((issue) => {
        if (issue.type === 'inactive') {
          const displayNdc = issue.ndc ?? 'NDC'
          const expiry = issue.description ? ` (expired ${issue.description})` : ''
          return `${displayNdc} is inactive${expiry}. Select an active package before dispensing.`
        }
      if (issue.type === 'unsupported_unit') {
        const unit = issue.unit ?? 'unknown unit'
        return `FDA returned a package (${issue.ndc ?? 'NDC'}) using unsupported unit "${unit}". Try searching by drug name or selecting a different NDC.`
      }
      if (issue.type === 'no_packages') {
        // FDA no package records warning deactivated per user request
        // return 'FDA returned no package records for this NDC/RxCUI.'
        return null
      }
      return null
      })
      .filter((message): message is string => Boolean(message))
    warnings.push(...issueMessages, ...calcResult.warnings)

    const result: CalcResult = {
      ...calcResult,
      warnings,
      parsedSig: sigResult.parsed,
      drugName: lookupName ?? drug,
      unparsedPackages,
      aiSuggestion: aiSuggestion ?? undefined,
      inactiveNdcs: inactiveIssues,
      json: buildResultJson({
        drug,
        days,
        sig,
        lookupType,
        calc: calcResult,
        drugName: lookupName ?? drug,
        unparsedPackages,
        inactiveNdcs: inactiveIssues,
        aiSuggestion: aiSuggestion ?? undefined
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
  drugName,
  unparsedPackages,
  aiSuggestion,
  inactiveNdcs
}: {
  drug: string
  days: number
  sig: string
  lookupType: 'ndc' | 'rxnorm' | 'ai'
  calc: Pick<CalcResult, 'ndcs' | 'totalQty' | 'dispensedQty' | 'overfillPct'>
  drugName: string
  unparsedPackages: UnparsedPackage[]
  aiSuggestion?: CalcResult['aiSuggestion']
  inactiveNdcs?: CalcResult['inactiveNdcs']
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
    unparsedPackages,
    inactiveNdcs,
    aiSuggestion,
    generatedAt: new Date().toISOString()
  }

  return JSON.stringify(payload, null, 2)
}

function convertAiPackages(product: AiSuggestionResult['product']) {
  const packages: NdcPackage[] = []
  const unparsed: UnparsedPackage[] = []
  const issues: FdaIssue[] = []
  const today = new Date()
  let unsupportedCount = 0

  for (const pkg of product.packages) {
    let normalized: string
    try {
      normalized = normalizeNdc(pkg.ndc)
    } catch {
      continue
    }

    const formatted = formatNdc11(normalized)
    const description = pkg.description ?? ''
    const sizeInfo = parsePackageDescription(description)

    if (!sizeInfo) {
      const rawUnitMatch = description.match(/(\d+(?:\.\d+)?)\s*([A-Za-z\[\]\-]+)/i)
      issues.push({
        type: 'unsupported_unit',
        ndc: formatted,
        description,
        unit: rawUnitMatch?.[2]
      })
      unparsed.push({
        ndc: formatted,
        description,
        labelerName: product.labelerName ?? undefined,
        productName: product.genericName ?? product.brandName ?? undefined
      })
      unsupportedCount += 1
      continue
    }

    const inactive = isInactive(
      product.marketingEndDate ?? undefined,
      pkg.marketingEndDate ?? undefined,
      today
    )

    packages.push({
      ndc: normalized,
      formattedNdc: formatted,
      size: sizeInfo.size,
      unit: sizeInfo.unit,
      inactive,
      description,
      labelerName: product.labelerName ?? undefined,
      packageDescription: description,
      productName: product.genericName ?? product.brandName ?? undefined
    })
  }

  console.info('[calc] convertAiPackages summary', {
    productNdc: product.productNdc,
    totalPackages: product.packages.length,
    parsedCount: packages.length,
    unsupportedCount,
    issueCount: issues.length
  })

  return { packages, unparsed, issues }
}

function isInactive(productEnd: string | undefined, pkgEnd: string | undefined, today: Date): boolean {
  return (productEnd ? isBeforeDate(productEnd, today) : false) || (pkgEnd ? isBeforeDate(pkgEnd, today) : false)
}

function isBeforeDate(dateString: string, today: Date): boolean {
  const parts = dateString.split('-')
  if (parts.length !== 3) return false
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  return !Number.isNaN(date.valueOf()) && date < today
}

