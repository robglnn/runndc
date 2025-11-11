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

const BASE_TOKENS = ['tab', 'tablet', 'capsule', 'cap', 'ml', 'mg', 'mcg', 'solution']

export async function suggestNdcViaAi(params: {
  drug: string
  sig?: string
  days?: number
}): Promise<AiSuggestionResult | null> {
  const client = getOpenAIClient()
  if (!client) return null

  try {
    const index = await getLocalNdcIndex()

    const parsed = await parsePrescription(client, params)
    const candidates = rankCandidates(index, params, parsed)

    if (!candidates.length) {
      return null
    }

    const selection = await pickBestCandidate(client, parsed, candidates.slice(0, 6))
    if (!selection?.productNdc) {
    return null
  }

    const match = candidates.find((candidate) => candidate.item.productNdc === selection.productNdc)
    if (!match) {
      return null
    }

    return {
      product: match.item,
      packages: match.item.packages,
      rationale: selection.rationale ?? 'AI-selected NDC based on text similarity',
      confidence: selection.confidence,
      model: selection.model
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
  params: { drug: string },
  parsed: ParsedPrescription
): Candidate[] {
  const tokens = new Set<string>()

  const addTokens = (value?: string) => {
    if (!value) return
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((part) => part.length > 1 && !BASE_TOKENS.includes(part))
      .forEach((token) => tokens.add(token))
  }

  addTokens(params.drug)
  addTokens(parsed.genericName)
  addTokens(parsed.brandName)
  addTokens(parsed.dosageForm)
  parsed.additionalKeywords.forEach((token) => addTokens(token))

  const strengthTokens = new Set(
    parsed.strengthTokens
      .map((token) => token.toLowerCase())
      .filter((token) => token.length > 1)
  )

  if (tokens.size === 0 && strengthTokens.size === 0) {
    return []
  }

  const candidates: Candidate[] = []

  for (const item of index.items) {
    let score = 0

    for (const token of tokens) {
      if (item.searchTokens.includes(token)) {
        score += 4
      }
    }

    if (parsed.dosageForm && item.dosageForm) {
      if (item.dosageForm.toLowerCase().includes(parsed.dosageForm.toLowerCase())) {
        score += 3
      }
    }

    if (parsed.route && item.route.some((route) => route.toLowerCase().includes(parsed.route!))) {
      score += 2
    }

    if (strengthTokens.size > 0) {
      for (const ingredient of item.activeIngredients) {
        const strength = (ingredient.strength ?? '').toLowerCase()
        for (const token of strengthTokens) {
          if (strength.includes(token)) {
            score += 2
          }
        }
      }
    }

    if (score > 0) {
      candidates.push({ item, score })
    }
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates.slice(0, 100)
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

