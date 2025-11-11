import type OpenAI from 'openai'

interface RxNormIdGroup {
  rxnormId?: string[]
  name?: string
}

interface RxNormResponse {
  idGroup?: RxNormIdGroup
}

interface PropertyResponse {
  propConcept?: {
    propValue?: string
  }
}

const cache = new Map<string, LookupResult>()

export interface LookupResult {
  rxcui: string | null
  name?: string
  warnings: string[]
  suggestion?: string
}

export async function getRxCui(
  drug: string,
  fetcher: typeof fetch,
  openai?: OpenAI
): Promise<LookupResult> {
  const key = drug.toLowerCase()
  if (cache.has(key)) {
    return cache.get(key)!
  }

  const warnings: string[] = []
  const url = `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(drug)}&search=1`

  try {
    const response = await fetcher(url)
    if (!response.ok) {
      warnings.push(`RxNorm lookup failed (${response.status})`)
      const result: LookupResult = { rxcui: null, warnings }
      cache.set(key, result)
      return result
    }

    const data = await parseRxnormJson<RxNormResponse>(response, url)
    const ids = data.idGroup?.rxnormId ?? []
    const name = data.idGroup?.name

    if (ids.length === 0) {
      const result = await attemptSuggestion(drug, warnings, fetcher, openai)
      cache.set(key, result)
      return result
    }

    const preferred = await pickPreferredRxcui(ids, fetcher)
    const result: LookupResult = { rxcui: preferred ?? ids[0], name, warnings }
    cache.set(key, result)
    return result
  } catch (error) {
    warnings.push(`RxNorm lookup error: ${(error as Error).message}`)
    const result: LookupResult = { rxcui: null, warnings }
    cache.set(key, result)
    return result
  }
}

async function pickPreferredRxcui(ids: string[], fetcher: typeof fetch): Promise<string | null> {
  for (const id of ids) {
    try {
      const url = `https://rxnav.nlm.nih.gov/REST/rxcui/${id}/property.json?propName=TTY`
      const res = await fetcher(url)
      if (!res.ok) continue
      const data = await parseRxnormJson<PropertyResponse>(res, url)
      const tty = data.propConcept?.propValue
      if (tty?.toUpperCase() === 'IN') {
        return id
      }
    } catch {
      // ignore and continue
    }
  }

  return null
}

async function attemptSuggestion(
  drug: string,
  warnings: string[],
  fetcher: typeof fetch,
  openai?: OpenAI
): Promise<LookupResult> {
  const variant = await tryVariantLookups(drug, warnings, fetcher)
  if (variant) {
    cache.set(drug.toLowerCase(), variant)
    return variant
  }

  if (!openai) {
    warnings.push('No RxNorm match. Provide a different drug term or include NDC.')
    return { rxcui: null, warnings }
  }

  try {
    const suggestion = await suggestAlternative(drug, openai)
    if (!suggestion) {
      warnings.push('No RxNorm match after OpenAI suggestion.')
      return { rxcui: null, warnings }
    }

    warnings.push(`No direct RxNorm match. Retrying with suggestion "${suggestion}".`)
    const retry = await getRxCui(suggestion, fetcher)
    if (retry.rxcui) {
      return { ...retry, suggestion, warnings: [...warnings, ...retry.warnings] }
    }

    warnings.push('Suggestion did not resolve to RxNorm.')
    return { rxcui: null, suggestion, warnings: [...warnings, ...retry.warnings] }
  } catch (error) {
    warnings.push(`Suggestion lookup failed: ${(error as Error).message}`)
    return { rxcui: null, warnings }
  }
}

async function suggestAlternative(drug: string, openai: OpenAI): Promise<string | null> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [
      {
        role: 'system',
        content:
          'You assist with RxNorm lookups. Reply ONLY with JSON: {"suggestion":"<name>"} using a generic term likely to match RxNorm.'
      },
      {
        role: 'user',
        content: `Original term: "${drug}". If the term is already suitable, repeat it.`
      }
    ]
  })

  const raw = completion.choices[0]?.message?.content
  const text = extractMessageText(raw)
  if (!text) return null

  try {
    const parsed = JSON.parse(text) as { suggestion?: string }
    return parsed.suggestion?.trim() ?? null
  } catch {
    return null
  }
}

async function tryVariantLookups(
  drug: string,
  warnings: string[],
  fetcher: typeof fetch
): Promise<LookupResult | null> {
  const normalized = drug.replace(/\s+/g, ' ').trim()
  const variants = deriveVariants(normalized)

  for (const variant of variants) {
    if (!variant || variant.toLowerCase() === normalized.toLowerCase()) continue
    const url = `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(variant)}&search=1`
    try {
      const response = await fetcher(url)
      if (!response.ok) continue
      const data = await parseRxnormJson<RxNormResponse>(response, url)
      const ids = data.idGroup?.rxnormId ?? []
      if (ids.length === 0) continue

      const preferred = await pickPreferredRxcui(ids, fetcher)
      warnings.push(`Resolved via variant "${variant}".`)
      return { rxcui: preferred ?? ids[0], name: data.idGroup?.name, warnings }
    } catch {
      continue
    }
  }

  return null
}

async function parseRxnormJson<T>(response: Response, url: string): Promise<T> {
  const text = await response.text()
  try {
    return JSON.parse(text) as T
  } catch (error) {
    console.error(`Failed to parse RxNorm response from ${url}:`, text.slice(0, 200))
    throw new Error('RxNorm response was not valid JSON')
  }
}

function deriveVariants(drug: string): Set<string> {
  const variants = new Set<string>()
  variants.add(drug)

  // Lowercase to standardize
  const lower = drug.toLowerCase()

  // Remove dosage forms / descriptors
  const withoutForm = lower
    .replace(
      /\b(extended release|extended\-release|xr|sr|er|tablet|tablets|tab|tabs|capsule|capsules|cap|caps|inhaler|inhalation|aerosol|spray|solution|suspension|elixir|oral|prn)\b/g,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim()
  if (withoutForm) variants.add(withoutForm)

  // Remove strength descriptors (mg, mcg, ug, etc.)
  const withoutStrength = withoutForm
    .replace(/\b(\d+(\.\d+)?)(\s*)(mg|mcg|µg|ug|g|ml|mL|units?)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (withoutStrength) variants.add(withoutStrength)

  // Remove brand suffix like HFA, HCl
  const withoutSuffix = withoutStrength
    .replace(/\b(hfa|hcl|hbr|fumarate|tartrate|phosphate)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (withoutSuffix) variants.add(withoutSuffix)

  // Add tokens before commas or parentheses
  const comma = withoutSuffix.split(',')[0]?.trim()
  if (comma) variants.add(comma)

  const paren = withoutSuffix.split('(')[0]?.trim()
  if (paren) variants.add(paren)

  return variants
}
function extractMessageText(
  content: string | Array<{ type?: string; text?: string }> | null | undefined
): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (part.type === 'text' && part.text) return part.text
      return ''
    })
    .join('')
    .trim()
}

