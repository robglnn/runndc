import type OpenAI from 'openai'
import type { ParsedSig } from './types'

interface ParseResult {
  parsed: ParsedSig | null
  warnings: string[]
}

const UNIT_MAP: Record<string, string> = {
  tablet: 'tablet',
  tab: 'tablet',
  tabs: 'tablet',
  capsule: 'capsule',
  cap: 'capsule',
  caps: 'capsule',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  drop: 'drop',
  drops: 'drop',
  puff: 'puff',
  puffs: 'puff',
  unit: 'unit',
  units: 'unit'
}

const FREQUENCY_PATTERNS: Array<{ regex: RegExp; value: number }> = [
  { regex: /\b(twice daily|two times daily|bid|b\.i\.d\.)\b/i, value: 2 },
  { regex: /\b(three times daily|tid|t\.i\.d\.)\b/i, value: 3 },
  { regex: /\b(four times daily|qid|q\.i\.d\.)\b/i, value: 4 },
  { regex: /\b(every other day)\b/i, value: 0.5 },
  { regex: /\b(once daily|every day|daily|qd|q\.d\.)\b/i, value: 1 }
]

const PRN_REGEX = /\bprn\b/i

export async function parseSig(sig: string, openai?: OpenAI): Promise<ParseResult> {
  const warnings: string[] = []
  const cleaned = sig.trim()

  if (!cleaned) {
    throw new Error('SIG is required')
  }

  const prn = PRN_REGEX.test(cleaned)
  if (prn) warnings.push('PRN scripts may use partial fills.')

  const regexParsed = regexParse(cleaned, prn)
  if (regexParsed) {
    return { parsed: regexParsed, warnings }
  }

  if (!openai) {
    warnings.push('Unable to parse SIG automatically. Please refine input or provide structured fields.')
    return { parsed: null, warnings }
  }

  const aiParsed = await aiParse(cleaned, openai, prn)
  if (aiParsed) {
    return { parsed: aiParsed, warnings }
  }

  warnings.push('OpenAI fallback failed to parse SIG.')
  return { parsed: null, warnings }
}

function regexParse(sig: string, prn: boolean): ParsedSig | null {
  const doseMatch = sig.match(/(\d+(?:\.\d+)?)\s*(tablet|tab|tabs|capsule|cap|caps|ml|milliliters?|drop|drops|puff|puffs|unit|units)?/i)
  if (!doseMatch) return null

  const dose = Number(doseMatch[1])
  const unit = UNIT_MAP[doseMatch[2]?.toLowerCase() ?? 'unit']

  const frequency = detectFrequency(sig)
  if (frequency === null) return null

  return {
    dose,
    unit,
    frequencyPerDay: frequency,
    prn,
    source: 'regex'
  }
}

function detectFrequency(sig: string): number | null {
  for (const entry of FREQUENCY_PATTERNS) {
    if (entry.regex.test(sig)) {
      return entry.value
    }
  }

  const everyHours = sig.match(/\bevery\s+(\d+)\s*(hours?|hrs?|h)\b/i)
  if (everyHours) {
    const hours = Number(everyHours[1])
    if (hours > 0) {
      return Number((24 / hours).toFixed(2))
    }
  }

  const timesPerDay = sig.match(/(\d+)\s*(?:time|times)\s+per\s+day/i)
  if (timesPerDay) {
    return Number(timesPerDay[1])
  }

  return null
}

async function aiParse(sig: string, openai: OpenAI, prn: boolean): Promise<ParsedSig | null> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [
      {
        role: 'system',
        content:
          'Parse prescription SIG strings. Respond ONLY with JSON: {"dose": number, "unit": string, "frequencyPerDay": number}. Normalize unit to tablet, capsule, ml, drop, puff, or unit.'
      },
      {
        role: 'user',
        content: `SIG: "${sig}"`
      }
    ]
  })

  const message = completion.choices[0]?.message?.content
  const text = extractMessageText(message)
  if (!text) return null

  try {
    const payload = JSON.parse(text) as {
      dose?: number
      unit?: string
      frequencyPerDay?: number
    }

    if (
      typeof payload.dose === 'number' &&
      typeof payload.frequencyPerDay === 'number' &&
      payload.frequencyPerDay > 0
    ) {
      const normalizedUnit = UNIT_MAP[payload.unit?.toLowerCase() ?? 'unit'] ?? 'unit'
      return {
        dose: payload.dose,
        unit: normalizedUnit,
        frequencyPerDay: payload.frequencyPerDay,
        prn,
        raw: payload,
        source: 'openai'
      }
    }
  } catch {
    return null
  }

  return null
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

