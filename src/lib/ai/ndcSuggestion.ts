import { getOpenAIClient } from '$lib/openai'
type OpenAIClient = NonNullable<ReturnType<typeof getOpenAIClient>>
import {
  getLocalNdcIndex,
  type LocalNdcIndex,
  type LocalNdcItem,
  type LocalPackage
} from '$lib/localNdcIndex'

interface ParsedPrescription {
  genericName?: string
  brandName?: string
  strengthTokens: string[]
  dosageForm?: string
  route?: string
  additionalKeywords: string[]
}

interface Candidate {
  item: LocalNdcItem
  score: number
}

export interface AiSuggestionResult {
  product: LocalNdcItem
  packages: LocalPackage[]
  rationale: string
  confidence?: number
  model?: string
}

const BASE_TOKENS = [
  'tab',
  'tabs',
  'tablet',
  'tablets',
  'capsule',
  'capsules',
  'cap',
  'caps',
  'ml',
  'mg',
  'mcg',
  'solution',
  'oral',
  'po',
  'take',
  'sig',
  'daily',
  'day',
  'supply'
]
const UNIT_TOKENS = [
  'mg',
  'mcg',
  'g',
  'ml',
  'unit',
  'units',
  'meq',
  'puff',
  'actuation',
  'actuations',
  'inhalation',
  'inhalations'
]

export async function suggestNdcViaAi(params: {
  drug: string
  sig?: string
  days?: number
}): Promise<AiSuggestionResult | null> {
  try {
    const client = getOpenAIClient()
    const index = await getLocalNdcIndex()

    const parsed = client ? await parsePrescription(client, params) : fallbackParse(params)
    const candidates = rankCandidates(index, params, parsed)

    if (!candidates.length) {
      return null
    }

    if (client) {
      const selection = await pickBestCandidate(client, parsed, candidates.slice(0, 6))
      if (selection?.productNdc) {
        const match = candidates.find(
          (candidate) => candidate.item.productNdc === selection.productNdc
        )
        if (match) {
          return {
            product: match.item,
            packages: match.item.packages,
            rationale: selection.rationale ?? 'AI-selected NDC based on text similarity',
            confidence: selection.confidence,
            model: selection.model
          }
        }
      }
      // fall back to deterministic pick if LLM did not pick a match
      const match = candidates[0]
      if (!match) {
        return null
      }

      return {
        product: match.item,
        packages: match.item.packages,
        rationale: 'Matched local NDC index via keyword scoring (LLM fallback).',
        confidence: undefined,
        model: selection?.model ?? 'fallback-local'
      }
    }

    // Fallback: pick highest score deterministically
    const match = candidates[0]
    if (!match) return null

    const matchedTokens = Array.from(
      new Set(match.item.searchTokens.filter((token) => token.length > 2).slice(0, 5))
    )
    return {
      product: match.item,
      packages: match.item.packages,
      rationale: `Matched local NDC index on tokens: ${matchedTokens.join(', ')}`,
      confidence: undefined,
      model: 'fallback-local'
    }
  } catch (error) {
    console.error('AI suggestion failed', error)
    return null
  }
}

async function parsePrescription(
  client: OpenAIClient,
  params: { drug: string; sig?: string; days?: number }
): Promise<ParsedPrescription> {
  const prompt = `
You are assisting with matching prescription free text to FDA NDC data.

Extract key attributes from the provided text and respond strictly in JSON with the schema:
{
  "generic_name": string | null,
  "brand_name": string | null,
  "strength_tokens": string[],
  "dosage_form": string | null,
  "route": string | null,
  "additional_keywords": string[]
}

Use lower-case tokens. Return arrays even if empty.

Prescription text:
Drug field: "${params.drug}"
SIG: "${params.sig ?? ''}"
Days supply: "${params.days ?? ''}"
`

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'You extract structured data from prescriptions.' },
      { role: 'user', content: prompt }
    ]
  })

  const rawContent = completion.choices?.[0]?.message?.content
  if (!rawContent) {
    return { strengthTokens: [], additionalKeywords: [] }
  }

  try {
    const json = JSON.parse(rawContent)
    return {
      genericName: json.generic_name ?? undefined,
      brandName: json.brand_name ?? undefined,
      strengthTokens: Array.isArray(json.strength_tokens)
        ? json.strength_tokens.map(String)
        : [],
      dosageForm: json.dosage_form ?? undefined,
      route: json.route ?? undefined,
      additionalKeywords: Array.isArray(json.additional_keywords)
        ? json.additional_keywords.map(String)
        : []
    }
  } catch (error) {
    console.error('Failed to parse prescription JSON from OpenAI', error, rawContent)
    return { strengthTokens: [], additionalKeywords: [] }
  }
}

function rankCandidates(
  index: LocalNdcIndex,
  params: { drug: string; sig?: string },
  parsed: ParsedPrescription
): Candidate[] {
  const {
    tokens,
    ingredientTokens,
    numericTokens,
    unitTokens,
    desiredDosageForm,
    desiredRoute
  } = buildTokenContext(params, parsed)

  if (tokens.size === 0 && numericTokens.size === 0 && ingredientTokens.size === 0) {
    return simpleFallback(index, params.drug)
  }

  const strict = evaluateCandidates({
    index,
    tokens,
    ingredientTokens,
    numericTokens,
    unitTokens,
    desiredDosageForm,
    desiredRoute,
    relaxRoute: false,
    relaxForm: false
  })
  if (strict.length > 0) {
    return strict
  }

  const relaxed = evaluateCandidates({
    index,
    tokens,
    ingredientTokens,
    numericTokens,
    unitTokens,
    desiredDosageForm,
    desiredRoute,
    relaxRoute: true,
    relaxForm: true
  })
  if (relaxed.length > 0) {
    return relaxed
  }

  return simpleFallback(index, params.drug)
}

async function pickBestCandidate(
  client: OpenAIClient,
  parsed: ParsedPrescription,
  topCandidates: Candidate[]
) {
  if (!topCandidates.length) return null

  const payload = topCandidates.map(({ item, score }) => ({
    product_ndc: item.productNdc,
    generic_name: item.genericName,
    brand_name: item.brandName,
    dosage_form: item.dosageForm,
    route: item.route,
    labeler_name: item.labelerName,
    score,
    active_ingredients: item.activeIngredients.slice(0, 3),
    package_examples: item.packages.slice(0, 3).map((pkg) => ({
      ndc: pkg.ndc,
      description: pkg.description
    }))
  }))

  const prompt = `
You are selecting the best FDA NDC product based on prescription details.

Prescription summary:
${JSON.stringify(parsed, null, 2)}

Candidate products:
${JSON.stringify(payload, null, 2)}

Return JSON matching:
{
  "product_ndc": string | null,
  "confidence": number | null,
  "rationale": string
}

If none are suitable, set product_ndc to null and explain.
`

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'You select the most appropriate FDA NDC product.' },
      { role: 'user', content: prompt }
    ]
  })

  const raw = completion.choices?.[0]?.message?.content
  if (!raw) return null

  try {
    const parsedResponse = JSON.parse(raw)
    return {
      productNdc: parsedResponse.product_ndc ?? null,
      confidence: typeof parsedResponse.confidence === 'number' ? parsedResponse.confidence : undefined,
      rationale: parsedResponse.rationale ?? '',
      model: completion.model
    }
  } catch (error) {
    console.error('Failed to parse AI selection JSON', error, raw)
    return null
  }
}

function fallbackParse(params: { drug: string; sig?: string; days?: number }): ParsedPrescription {
  const normalizedDrug = params.drug.toLowerCase()
  const sigTokens = params.sig?.toLowerCase().split(/[\s,]+/) ?? []
  const tokens = normalizedDrug.split(/[\s,]+/).filter(Boolean)
  const combinedTokens = [...tokens, ...sigTokens]
  const strengthTokens = tokens.filter((token) => /\d+/.test(token))
  const dosageForm =
    guessDosageForm(combinedTokens) ?? guessDosageForm(tokens) ?? guessDosageForm(sigTokens)
  const route = deriveRoute(params.sig)

  return {
    genericName: params.drug,
    strengthTokens,
    dosageForm,
    route,
    additionalKeywords: combinedTokens.filter(
      (token) => token.length > 2 && !strengthTokens.includes(token)
    )
  }
}

function guessDosageForm(tokens: string[]): string | undefined {
  const forms = [
    'tablet',
    'tab',
    'tablets',
    'capsule',
    'cap',
    'capsules',
    'solution',
    'suspension',
    'inhaler',
    'aerosol',
    'patch',
    'cream',
    'ointment',
    'gel',
    'spray',
    'injection',
    'syringe',
    'pen',
    'lozenge',
    'powder',
    'granules'
  ]
  for (const token of tokens) {
    if (forms.includes(token)) {
      return token
    }
  }
  return undefined
}

function simpleFallback(index: LocalNdcIndex, rawDrug: string): Candidate[] {
  const needle = rawDrug.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!needle) return []

  const candidates: Candidate[] = []
  for (const item of index.items) {
    const haystack = `${item.genericName ?? ''} ${item.brandName ?? ''}`.toLowerCase()
    if (haystack.includes(needle.split(' ')[0])) {
      const score = haystack.includes(needle) ? 100 : 10
      candidates.push({ item, score })
    }
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 100)
}

function buildTokenContext(
  params: { drug: string; sig?: string },
  parsed: ParsedPrescription
) {
  const tokens = new Set<string>()
  const ingredientTokens = new Set<string>()
  const numericTokens = new Set<string>()
  const unitTokens = new Set<string>()

  const registerToken = (token: string) => {
    if (!token) return
    const normalized = token.toLowerCase().trim()
    if (!normalized || normalized.length < 2) return
    if (BASE_TOKENS.includes(normalized)) return
    tokens.add(normalized)
    if (/\d/.test(normalized)) {
      numericTokens.add(normalized)
    } else if (UNIT_TOKENS.includes(normalized)) {
      unitTokens.add(normalized)
    } else {
      ingredientTokens.add(normalized)
    }
  }

  const collect = (value?: string) => {
    if (!value) return
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .forEach(registerToken)
  }

  collect(params.drug)
  collect(parsed.genericName)
  collect(parsed.brandName)
  collect(parsed.dosageForm)
  parsed.additionalKeywords.forEach(registerToken)

  const strengthTokens = parsed.strengthTokens
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 0)
  strengthTokens.forEach(registerToken)

  const desiredDosageForm = canonicalDosageForm(
    parsed.dosageForm ?? guessDosageFormFromText(params.drug, params.sig)
  )
  const desiredRoute = canonicalRoute(parsed.route ?? deriveRoute(params.sig))

  return {
    tokens,
    ingredientTokens,
    numericTokens,
    unitTokens,
    desiredDosageForm,
    desiredRoute
  }
}

function evaluateCandidates({
  index,
  tokens,
  ingredientTokens,
  numericTokens,
  unitTokens,
  desiredDosageForm,
  desiredRoute,
  relaxRoute,
  relaxForm
}: {
  index: LocalNdcIndex
  tokens: Set<string>
  ingredientTokens: Set<string>
  numericTokens: Set<string>
  unitTokens: Set<string>
  desiredDosageForm?: string
  desiredRoute?: string
  relaxRoute: boolean
  relaxForm: boolean
}): Candidate[] {
  const candidates: Candidate[] = []

  const desiredIngredients = Array.from(ingredientTokens).filter((token) => token.length > 2)

  for (const item of index.items) {
    const candidateForm = canonicalDosageForm(item.dosageForm ?? undefined)
    const candidateRoutes = item.route.map((route) => canonicalRoute(route)).filter(Boolean) as string[]

    if (!relaxForm && desiredDosageForm && candidateForm && candidateForm !== desiredDosageForm) {
      continue
    }
    if (
      !relaxRoute &&
      desiredRoute &&
      candidateRoutes.length > 0 &&
      !candidateRoutes.includes(desiredRoute)
    ) {
      continue
    }

    if (desiredIngredients.length > 0) {
      const ingredientNames = item.activeIngredients
        .map((ingredient) => ingredient.name?.toLowerCase() ?? '')
        .filter(Boolean)
      const ingredientHit = desiredIngredients.some(
        (token) =>
          ingredientNames.some((name) => name.includes(token)) ||
          item.searchTokens.includes(token)
      )
      if (!ingredientHit) {
        continue
      }
    }

    let score = 0

    for (const token of tokens) {
      if (item.searchTokens.includes(token)) {
        score += 4
      }
    }

    if (desiredDosageForm && candidateForm === desiredDosageForm) {
      score += 12
    } else if (candidateForm && desiredDosageForm && candidateForm !== desiredDosageForm) {
      score -= 8
    }

    if (desiredRoute) {
      if (candidateRoutes.includes(desiredRoute)) {
        score += 6
      } else if (candidateRoutes.length > 0) {
        score -= 6
      }
    }

    const strengthMatchBonus = computeStrengthScore(item, numericTokens, unitTokens)
    score += strengthMatchBonus

    if (score > 0) {
      candidates.push({ item, score })
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates.slice(0, 100)
}

function computeStrengthScore(
  item: LocalNdcItem,
  numericTokens: Set<string>,
  unitTokens: Set<string>
): number {
  if (numericTokens.size === 0) return 0
  let score = 0

  const strengthStrings = item.activeIngredients
    .map((ingredient) => ingredient.strength?.toLowerCase() ?? '')
    .filter(Boolean)

  for (const numeric of numericTokens) {
    if (!/\d/.test(numeric)) continue
    const hits = strengthStrings.some((strength) => strength.includes(numeric))
    if (hits) {
      score += 8
      if (unitTokens.size > 0) {
        const unitHit = strengthStrings.some((strength) =>
          Array.from(unitTokens).some((unit) => strength.includes(unit))
        )
        if (unitHit) {
          score += 4
        }
      }
    }
  }

  // inspect package descriptions for extra signal
  for (const pkg of item.packages) {
    const desc = pkg.description?.toLowerCase() ?? ''
    if (!desc) continue
    const numericHit = Array.from(numericTokens).some((token) => desc.includes(token))
    if (numericHit) {
      score += 3
      if (unitTokens.size > 0) {
        const unitHit = Array.from(unitTokens).some((unit) => desc.includes(unit))
        if (unitHit) {
          score += 2
        }
      }
    }
  }

  return score
}

function canonicalDosageForm(form?: string): string | undefined {
  if (!form) return undefined
  const normalized = form.toLowerCase()
  if (normalized.includes('tablet')) return 'tablet'
  if (normalized.includes('capsule')) return 'capsule'
  if (normalized.includes('caplet')) return 'capsule'
  if (normalized.includes('solution')) return 'solution'
  if (normalized.includes('suspension')) return 'suspension'
  if (normalized.includes('inhaler') || normalized.includes('aerosol') || normalized.includes('inhalant')) {
    return 'inhaler'
  }
  if (normalized.includes('injection') || normalized.includes('injectable')) return 'injection'
  if (normalized.includes('patch')) return 'patch'
  if (normalized.includes('cream')) return 'cream'
  if (normalized.includes('ointment')) return 'ointment'
  if (normalized.includes('gel')) return 'gel'
  if (normalized.includes('spray')) return 'spray'
  if (normalized.includes('powder')) return 'powder'
  if (normalized.includes('granule')) return 'granule'
  if (normalized.includes('pen')) return 'pen'
  if (normalized.includes('kit')) return 'kit'
  return normalized.split(',')[0]?.trim()
}

function canonicalRoute(route?: string): string | undefined {
  if (!route) return undefined
  const normalized = route.toLowerCase()
  if (normalized.includes('oral') || normalized === 'po') return 'oral'
  if (normalized.includes('intravenous') || normalized === 'iv') return 'intravenous'
  if (normalized.includes('injection') || normalized.includes('intramuscular') || normalized === 'im') {
    return 'injection'
  }
  if (normalized.includes('subcutaneous') || normalized === 'sc' || normalized === 'sq') {
    return 'subcutaneous'
  }
  if (normalized.includes('topical')) return 'topical'
  if (normalized.includes('transdermal')) return 'transdermal'
  if (normalized.includes('ophthalmic')) return 'ophthalmic'
  if (normalized.includes('otic')) return 'otic'
  if (normalized.includes('nasal')) return 'nasal'
  if (normalized.includes('inhalation')) return 'inhalation'
  return normalized
}

function deriveRoute(sig?: string): string | undefined {
  if (!sig) return undefined
  const text = sig.toLowerCase()
  if (/\b(po|by mouth|orally|oral)\b/.test(text)) return 'oral'
  if (/\bintravenous\b|\biv\b/.test(text)) return 'intravenous'
  if (/\bintramuscular\b|\bim\b/.test(text)) return 'injection'
  if (/\bsubcutaneous\b|\bsc\b|\bsq\b/.test(text)) return 'subcutaneous'
  if (/\btopical\b|\bapply\b/.test(text)) return 'topical'
  if (/\binhale\b|\binhalation\b/.test(text)) return 'inhalation'
  if (/\bophthalmic\b|\beye\b/.test(text)) return 'ophthalmic'
  if (/\botic\b|\bear\b/.test(text)) return 'otic'
  if (/\bnasal\b/.test(text)) return 'nasal'
  return undefined
}

function guessDosageFormFromText(drug: string, sig?: string): string | undefined {
  const combined = `${drug ?? ''} ${sig ?? ''}`.toLowerCase()
  if (!combined.trim()) return undefined
  const tokens = combined.split(/[\s,]+/).filter(Boolean)
  return guessDosageForm(tokens)
}

