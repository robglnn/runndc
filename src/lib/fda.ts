import { formatNdc11, normalizeNdc } from './ndcUtils'
import type { NdcPackage, UnparsedPackage } from './types'
import { getLocalNdcIndex } from '$lib/localNdcIndex'
import type { LocalNdcIndex, LocalNdcItem, LocalPackage } from '$lib/localNdcIndex'
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

export type FdaIssueType = 'unsupported_unit' | 'no_packages' | 'inactive'

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

  const data = await parseJsonResponse(response, url)
  const localIndex = await loadLocalIndexSafe()
  const packages = collectPackages(data, undefined, issues, unparsed, localIndex)
  if (packages.length === 0 && issues.every((issue) => issue.type !== 'no_packages')) {
    const productCode = data.results?.[0]?.product_ndc
    await maybeAddInactiveIssueFromIndex(issues, productCode, localIndex)
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
  const localIndex = await loadLocalIndexSafe()

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

      const productData = await parseJsonResponse(productResponse, productUrl)
      const packages = collectPackages(productData, ndc11, issues, unparsed, localIndex)
      if (packages.length > 0) {
        return { packages, issues, unparsedPackages: unparsed }
      }
    }

    await maybeAddInactiveIssueFromIndex(issues, formatted, localIndex)
    issues.push({ type: 'no_packages' })
    return { packages: [], issues, unparsedPackages: unparsed }
  }

  if (!response.ok) {
    throw new Error(`FDA NDC lookup failed (${response.status})`)
  }

  const data = await parseJsonResponse(response, packageUrl)
  const packages = collectPackages(data, ndc11, issues, unparsed, localIndex)
  if (packages.length === 0 && issues.every((issue) => issue.type !== 'no_packages')) {
    await maybeAddInactiveIssueFromIndex(issues, formatted, localIndex)
    issues.push({ type: 'no_packages' })
  }
  return { packages, issues, unparsedPackages: unparsed }
}

function collectPackages(
  data: OpenFdaResponse,
  fallbackPlainNdc: string | undefined,
  issues: FdaIssue[],
  unparsedPackages: UnparsedPackage[],
  localIndex: LocalNdcIndex | null
): NdcPackage[] {
  const packages: NdcPackage[] = []
  const today = new Date()

  for (const result of data.results ?? []) {
    const labeler = result.labeler_name
    const productInactive = result.marketing_end_date ? isBeforeToday(result.marketing_end_date, today) : false
    const localProduct = findLocalProduct(localIndex, result.product_ndc ?? fallbackPlainNdc)

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

      const localPkg = findLocalPackage(localProduct, formatted)
      const marketingEnd =
        entry.marketing_end_date ??
        (localPkg?.marketingEndDate ? normalizeDateString(localPkg.marketingEndDate) : null) ??
        (result.marketing_end_date ? normalizeDateString(result.marketing_end_date) : null)
      const inactive =
        productInactive ||
        (marketingEnd ? isBeforeToday(marketingEnd, today) : false)

      packages.push({
        ndc: normalized,
        formattedNdc: formatted,
        size: sizeInfo.size,
        unit: sizeInfo.unit,
        inactive,
        description,
        labelerName: labeler,
        packageDescription: description,
        productName: result.generic_name ?? result.brand_name,
        marketingEndDate: marketingEnd
      })
    }
  }

  const seen = new Map<string, NdcPackage>()
  for (const pkg of packages) {
    if (!seen.has(pkg.ndc)) {
      seen.set(pkg.ndc, pkg)
    }
  }

  const deduped = [...seen.values()].sort((a, b) => a.size - b.size)
  if (deduped.length > 0 && deduped.every((pkg) => pkg.inactive)) {
    issues.push({ type: 'inactive', ndc: deduped[0].formattedNdc })
  }
  return deduped
}

function isBeforeToday(dateString: string, today: Date): boolean {
  const normalized = normalizeDateString(dateString)
  if (!normalized) return false
  const parts = normalized.split('-')
  if (parts.length !== 3) return false
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  return !Number.isNaN(date.valueOf()) && date < today
}

function extractRawUnit(description?: string): string | undefined {
  if (!description) return undefined
  const match = description.match(/(\d+(?:\.\d+)?)\s*([A-Za-z\[\]\-]+)/i)
  return match?.[2]
}

async function parseJsonResponse(response: Response, url: string): Promise<OpenFdaResponse> {
  const text = await response.text()
  try {
    return JSON.parse(text) as OpenFdaResponse
  } catch (error) {
    console.error(`Failed to parse FDA response from ${url}:`, text.slice(0, 200))
    throw new Error('FDA response was not valid JSON')
  }
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

async function maybeAddInactiveIssueFromIndex(
  issues: FdaIssue[],
  formattedPackageNdc: string | undefined,
  localIndex: LocalNdcIndex | null
) {
  try {
    if (!formattedPackageNdc) return
    const index = localIndex ?? (await getLocalNdcIndex())
    const product = findLocalProduct(index, formattedPackageNdc)
    if (!product) return
    const today = new Date()
    const hasActivePackage = product.packages.some((pkg) => {
      if (!pkg.marketingEndDate) return true
      const normalized = normalizeDateString(pkg.marketingEndDate)
      return !(normalized && isBeforeToday(normalized, today))
    })
    if (!hasActivePackage) {
      console.info('[fda] marking inactive from local index', formattedPackageNdc)
      const latestEnd = product.packages
        .map((pkg) => normalizeDateString(pkg.marketingEndDate ?? undefined))
        .filter((date): date is string => Boolean(date))
        .sort()
        .pop()
      issues.push({ type: 'inactive', ndc: formattedPackageNdc, description: latestEnd })
    }
  } catch (error) {
    console.error('Failed to look up inactive status from local index', error)
  }
}

async function loadLocalIndexSafe(): Promise<LocalNdcIndex | null> {
  try {
    return await getLocalNdcIndex()
  } catch (error) {
    console.error('Failed to load local NDC index', error)
    return null
  }
}

function findLocalProduct(
  localIndex: LocalNdcIndex | null,
  productCode?: string | null
): LocalNdcItem | undefined {
  if (!localIndex || !productCode) return undefined
  if (productCode.includes('-')) {
    const segments = productCode.split('-')
    if (segments.length === 3) {
      const candidate = `${segments[0]}-${segments[1]}`
      const trimmedCandidate = `${segments[0]}-${segments[1].replace(/^0+/, '') || '0'}`
      const found =
        localIndex.productMap.get(candidate) ??
        localIndex.productMap.get(candidate.replace(/\D/g, '')) ??
        localIndex.productMap.get(trimmedCandidate) ??
        localIndex.productMap.get(trimmedCandidate.replace(/\D/g, ''))
      if (found) return found
    }
  }
  const plain = productCode.replace(/\D/g, '').slice(0, 9)
  if (!plain) return undefined
  return (
    localIndex.productMap.get(productCode) ??
    localIndex.productMap.get(plain) ??
    localIndex.productMap.get(`${plain.slice(0, 5)}-${plain.slice(5)}`)
  )
}

function findLocalPackage(product: LocalNdcItem | undefined, formattedNdc: string): LocalPackage | undefined {
  if (!product) return undefined
  const plain = formattedNdc.replace(/\D/g, '')
  return (
    product.packages.find((pkg) => pkg.ndc === formattedNdc) ??
    product.packages.find((pkg) => pkg.ndcPlain === plain)
  )
}

function normalizeDateString(dateString?: string | null): string | null {
  if (!dateString) return null
  if (dateString.includes('-')) return dateString
  if (dateString.length === 8) {
    return `${dateString.slice(0, 4)}-${dateString.slice(4, 6)}-${dateString.slice(6, 8)}`
  }
  return dateString
}

