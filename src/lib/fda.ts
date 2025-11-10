import { formatNdc11, normalizeNdc } from './ndcUtils'
import type { NdcPackage } from './types'

interface PackagingEntry {
  package_ndc?: string
  description?: string
  marketing_start_date?: string
  marketing_end_date?: string
  sample?: boolean
  count?: number | string
}

interface OpenFdaResult {
  product_ndc?: string
  labeler_name?: string
  marketing_end_date?: string
  packaging?: PackagingEntry[]
}

interface OpenFdaResponse {
  results?: OpenFdaResult[]
}

export async function getNdcPackagesByRxcui(
  rxcui: string,
  fetcher: typeof fetch
): Promise<NdcPackage[]> {
  const url = `https://api.fda.gov/drug/ndc.json?search=rxcui.exact:${encodeURIComponent(rxcui)}&limit=200`
  const response = await fetcher(url)

  if (!response.ok) {
    throw new Error(`FDA NDC lookup failed (${response.status})`)
  }

  const data = (await response.json()) as OpenFdaResponse
  return collectPackages(data)
}

export async function getNdcPackagesByPlainNdc(
  ndc11: string,
  fetcher: typeof fetch
): Promise<NdcPackage[]> {
  const formatted = formatNdc11(ndc11)
  const url = `https://api.fda.gov/drug/ndc.json?search=package_ndc.exact:"${formatted}"&limit=10`
  const response = await fetcher(url)

  if (!response.ok) {
    throw new Error(`FDA NDC lookup failed (${response.status})`)
  }

  const data = (await response.json()) as OpenFdaResponse
  return collectPackages(data, ndc11)
}

function collectPackages(data: OpenFdaResponse, fallbackPlainNdc?: string): NdcPackage[] {
  const packages: NdcPackage[] = []
  const today = new Date()

  for (const result of data.results ?? []) {
    const labeler = result.labeler_name
    const productInactive = result.marketing_end_date ? isBeforeToday(result.marketing_end_date, today) : false

    for (const entry of result.packaging ?? []) {
      const packageNdc = entry.package_ndc ?? result.product_ndc ?? fallbackPlainNdc
      if (!packageNdc) continue

      let normalized: string
      try {
        normalized = normalizeNdc(packageNdc)
      } catch {
        continue
      }

      const formatted = formatNdc11(normalized)
      const description = entry.description ?? ''
      const sizeInfo = parsePackageSize(entry)
      if (!sizeInfo) continue

      const inactive =
        productInactive ||
        (entry.marketing_end_date ? isBeforeToday(entry.marketing_end_date, today) : false)

      packages.push({
        ndc: normalized,
        formattedNdc: formatted,
        size: sizeInfo.size,
        unit: sizeInfo.unit,
        inactive,
        description,
        labelerName: labeler,
        packageDescription: description
      })
    }
  }

  const seen = new Map<string, NdcPackage>()
  for (const pkg of packages) {
    if (!seen.has(pkg.ndc)) {
      seen.set(pkg.ndc, pkg)
    }
  }

  return [...seen.values()].sort((a, b) => a.size - b.size)
}

function parsePackageSize(entry: PackagingEntry): { size: number; unit: string } | null {
  const description = entry.description ?? ''

  const countMatch = description.match(/(\d+(?:\.\d+)?)\s*(tablet|tab|capsule|cap|ml|milliliter|vial|patch|unit|each|dose|syringe|kit)s?/i)
  if (countMatch) {
    return { size: Number(countMatch[1]), unit: normalizeUnit(countMatch[2]) }
  }

  if (typeof entry.count === 'number') {
    return { size: entry.count, unit: 'unit' }
  }

  if (typeof entry.count === 'string' && entry.count.trim().length > 0) {
    const value = Number(entry.count)
    if (!Number.isNaN(value)) {
      return { size: value, unit: 'unit' }
    }
  }

  return null
}

function normalizeUnit(raw: string): string {
  const value = raw.toLowerCase()
  if (value.startsWith('tab')) return 'tablet'
  if (value.startsWith('cap')) return 'capsule'
  if (value.includes('ml')) return 'ml'
  if (value.startsWith('patch')) return 'patch'
  if (value.startsWith('vial')) return 'vial'
  if (value.startsWith('syringe')) return 'syringe'
  if (value.startsWith('kit')) return 'kit'
  return 'unit'
}

function isBeforeToday(dateString: string, today: Date): boolean {
  const parts = dateString.split('-')
  if (parts.length !== 3) return false
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  return !Number.isNaN(date.valueOf()) && date < today
}

