import type { OverageGuidance } from './types'

export function normalizeNdc(input: string): string {
  if (!input) throw new Error('NDC input is empty')

  const trimmed = input.trim()
  const digitsOnly = trimmed.replace(/\D/g, '')

  if (!digitsOnly) {
    throw new Error('NDC must contain digits')
  }

  if (digitsOnly.length === 11) {
    return digitsOnly
  }

  if (digitsOnly.length !== 10) {
    throw new Error('NDC must be 10 or 11 digits')
  }

  const hyphenMatch = trimmed.match(/^(\d{1,5})[-\s]?(\d{1,4})[-\s]?(\d{1,2})$/)
  const segments = hyphenMatch
    ? [hyphenMatch[1], hyphenMatch[2], hyphenMatch[3]]
    : [digitsOnly.slice(0, 4), digitsOnly.slice(4, 8), digitsOnly.slice(8)]

  const [labeler, product, packageCode] = segments

  switch (`${labeler.length}-${product.length}-${packageCode.length}`) {
    case '4-4-2': {
      return `0${labeler}${product}${packageCode}`
    }
    case '5-3-2': {
      return `${labeler}0${product}${packageCode}`
    }
    case '5-4-1': {
      return `${labeler}${product}0${packageCode}`
    }
    default: {
      // fallback: assume labeler needs padding
      if (labeler.length === 4) {
        return `0${labeler}${product}${packageCode}`
      }
      throw new Error('Unable to normalize NDC format')
    }
  }
}

export function formatNdc11(ndc11: string): string {
  const plain = ndc11.replace(/\D/g, '')
  if (plain.length !== 11) {
    throw new Error('NDC must be 11 digits to format')
  }

  return `${plain.slice(0, 5)}-${plain.slice(5, 9)}-${plain.slice(9)}`
}

export function looksLikeNdc(value: string): boolean {
  return /^[\d\- ]{10,14}$/.test(value.trim())
}

export function calculateOverfill(totalNeeded: number, dispensed: number): number {
  if (totalNeeded <= 0) return 0
  return (dispensed - totalNeeded) / totalNeeded
}

export const FDA_OVERAGE_GUIDANCE: OverageGuidance[] = [
  { min: 0, max: 30, allowanceUnits: 1, notes: '≤30 units → +1 unit (~2-3%)' },
  { min: 31, max: 100, allowanceUnits: 1, notes: '31-100 units → +1 unit (~1%)' },
  { min: 101, max: 500, allowanceUnits: 2, notes: '101-500 units → +1-2 units (0.5-1%)' },
  { min: 501, max: Number.POSITIVE_INFINITY, allowancePercent: 0.5, notes: '>500 units → +0.25-0.5%' }
]

export function guidanceForQuantity(qty: number): OverageGuidance | undefined {
  return FDA_OVERAGE_GUIDANCE.find((g) => qty >= g.min && qty <= g.max)
}

