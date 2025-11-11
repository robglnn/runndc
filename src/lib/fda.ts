import { formatNdc11, normalizeNdc } from './ndcUtils'
import type { NdcPackage, UnparsedPackage } from './types'
import { parsePackageDescription } from '$lib/packageParser'

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
    const productCandidates = buildProductCodes(formatted, ndc11)
    for (const productCode of productCandidates) {
      const productUrl = `https://api.fda.gov/drug/ndc.json?search=product_ndc:"${productCode}"&limit=10`
      const productResponse = await fetcher(productUrl)
      if (productResponse.status === 404) {
        continue
      }
      if (!productResponse.ok) {
        throw new Error(`FDA NDC lookup failed (${productResponse.status})`)
      }

      const productData = (await productResponse.json()) as OpenFdaResponse
      const packages = collectPackages(productData, ndc11, issues, unparsed)
      if (packages.length > 0) {
        return { packages, issues, unparsedPackages: unparsed }
      }
    }

    issues.push({ type: 'no_packages' })
    return { packages: [], issues, unparsedPackages: unparsed }
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
      const sizeInfo = parsePackageDescription(description)
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

function buildProductCodes(formattedPackageNdc: string, ndc11: string): string[] {
  const codes = new Set<string>()
  const segments = formattedPackageNdc.split('-') // 5-4-2
  if (segments.length !== 3) {
    return [ndc11.slice(0, 9)]
  }

  const [labeler, product] = segments
  codes.add(`${labeler}-${product}`) // 5-4 candidate

  if (labeler.startsWith('0')) {
    codes.add(`${labeler.slice(1)}-${product}`) // drop leading zero 4-4 candidate
  }

  if (product.startsWith('0')) {
    codes.add(`${labeler}-${product.slice(1)}`)
  }

  codes.add(`${ndc11.slice(0, 4)}-${ndc11.slice(4, 8)}`)

  return [...codes]
}

