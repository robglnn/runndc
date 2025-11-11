import { formatNdc11, normalizeNdc } from './ndcUtils'
import type { NdcPackage, UnparsedPackage } from './types'

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
  generic_name?: string
  brand_name?: string
  marketing_end_date?: string
  packaging?: PackagingEntry[]
}

interface OpenFdaResponse {
  results?: OpenFdaResult[]
}

export type FdaIssueType = 'unsupported_unit' | 'no_packages'

export interface FdaIssue {
  type: FdaIssueType
  ndc?: string
  unit?: string
  description?: string
}

export interface FdaPackageResult {
  packages: NdcPackage[]
  issues: FdaIssue[]
  unparsedPackages: UnparsedPackage[]
}

export async function getNdcPackagesByRxcui(
  rxcui: string,
  fetcher: typeof fetch
): Promise<FdaPackageResult> {
  const issues: FdaIssue[] = []
  const unparsed: UnparsedPackage[] = []
  const url = `https://api.fda.gov/drug/ndc.json?search=rxcui.exact:${encodeURIComponent(rxcui)}&limit=200`
  const response = await fetcher(url)

  if (response.status === 404) {
    issues.push({ type: 'no_packages' })
    return { packages: [], issues, unparsedPackages: unparsed }
  }

  if (!response.ok) {
    throw new Error(`FDA NDC lookup failed (${response.status})`)
  }

  const data = (await response.json()) as OpenFdaResponse
  const packages = collectPackages(data, undefined, issues, unparsed)
  if (packages.length === 0 && issues.every((issue) => issue.type !== 'no_packages')) {
    issues.push({ type: 'no_packages' })
  }
  return { packages, issues, unparsedPackages: unparsed }
}

export async function getNdcPackagesByPlainNdc(
  ndc11: string,
  fetcher: typeof fetch
): Promise<FdaPackageResult> {
  const issues: FdaIssue[] = []
  const unparsed: UnparsedPackage[] = []
  const formatted = formatNdc11(ndc11)
  const packageUrl = `https://api.fda.gov/drug/ndc.json?search=package_ndc.exact:"${formatted}"&limit=10`
  const response = await fetcher(packageUrl)

  if (response.status === 404) {
    // Fallback: query by product NDC (first 9 digits, formatted 5-4) to discover sibling packages
    const productPlain = ndc11.slice(0, 9)
    const productFormatted = `${productPlain.slice(0, 5)}-${productPlain.slice(5)}`
    const productUrl = `https://api.fda.gov/drug/ndc.json?search=product_ndc:"${productFormatted}"&limit=10`
    const productResponse = await fetcher(productUrl)
    if (!productResponse.ok) {
      if (productResponse.status === 404) {
        issues.push({ type: 'no_packages' })
        return { packages: [], issues, unparsedPackages: unparsed }
      }
      throw new Error(`FDA NDC lookup failed (${productResponse.status})`)
    }

    const productData = (await productResponse.json()) as OpenFdaResponse
    const packages = collectPackages(productData, ndc11, issues, unparsed)
    if (packages.length === 0 && issues.every((issue) => issue.type !== 'no_packages')) {
      issues.push({ type: 'no_packages' })
    }
    return { packages, issues, unparsedPackages: unparsed }
  }

  if (!response.ok) {
    throw new Error(`FDA NDC lookup failed (${response.status})`)
  }

  const data = (await response.json()) as OpenFdaResponse
  const packages = collectPackages(data, ndc11, issues, unparsed)
  if (packages.length === 0 && issues.every((issue) => issue.type !== 'no_packages')) {
    issues.push({ type: 'no_packages' })
  }
  return { packages, issues, unparsedPackages: unparsed }
}

function collectPackages(
  data: OpenFdaResponse,
  fallbackPlainNdc: string | undefined,
  issues: FdaIssue[],
  unparsedPackages: UnparsedPackage[]
): NdcPackage[] {
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
      if (!sizeInfo) {
        issues.push({
          type: 'unsupported_unit',
          ndc: formatted,
          unit: extractRawUnit(description),
          description
        })
        unparsedPackages.push({
          ndc: formatted,
          description,
          labelerName: labeler,
          productName: result.generic_name ?? result.brand_name
        })
        continue
      }

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
        packageDescription: description,
        productName: result.generic_name ?? result.brand_name
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
  const matches = [...description.matchAll(/(\d+(?:\.\d+)?)\s*([A-Za-z\[\]\-]+)/gi)]

  for (const match of matches) {
    const size = Number(match[1])
    const normalizedUnit = normalizeUnit(match[2])
    if (!Number.isNaN(size) && normalizedUnit) {
      return { size, unit: normalizedUnit }
    }
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

function normalizeUnit(raw: string): string | null {
  const value = raw.toLowerCase()
  const unitMap: Record<string, string> = {
    tablet: 'tablet',
    tablets: 'tablet',
    tab: 'tablet',
    tabs: 'tablet',
    capsule: 'capsule',
    capsules: 'capsule',
    cap: 'capsule',
    caps: 'capsule',
    ml: 'ml',
    milliliter: 'ml',
    milliliters: 'ml',
    millilitre: 'ml',
    millilitres: 'ml',
    vial: 'vial',
    vials: 'vial',
    patch: 'patch',
    patches: 'patch',
    unit: 'unit',
    units: 'unit',
    each: 'each',
    dose: 'dose',
    doses: 'dose',
    syringe: 'syringe',
    syringes: 'syringe',
    kit: 'kit',
    kits: 'kit',
    puff: 'puff',
    puffs: 'puff',
    actuation: 'puff',
    actuations: 'puff',
    spray: 'puff',
    sprays: 'puff',
    inhalation: 'inhalation',
    inhalations: 'inhalation',
    g: 'g',
    gram: 'g',
    grams: 'g',
    mg: 'mg',
    milligram: 'mg',
    milligrams: 'mg',
    mcg: 'mcg',
    microgram: 'mcg',
    micrograms: 'mcg',
    l: 'liter',
    liter: 'liter',
    liters: 'liter',
    litre: 'liter',
    litres: 'liter',
    cc: 'ml'
  }

  return unitMap[value] ?? null
}

function isBeforeToday(dateString: string, today: Date): boolean {
  const parts = dateString.split('-')
  if (parts.length !== 3) return false
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  return !Number.isNaN(date.valueOf()) && date < today
}

function extractRawUnit(description?: string): string | undefined {
  if (!description) return undefined
  const match = description.match(/(\d+(?:\.\d+)?)\s*([A-Za-z\[\]\-]+)/i)
  return match?.[2]
}

