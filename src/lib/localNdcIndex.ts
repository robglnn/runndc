import { readFile } from 'fs/promises'
import { gunzipSync } from 'zlib'
import { normalizeNdc } from '$lib/ndcUtils'

interface RawNdcIndex {
  generatedAt: string
  total: number
  items: RawNdcItem[]
}

interface RawNdcItem {
  productNdc: string | null
  productNdcPlain: string | null
  labelerName: string | null
  genericName: string | null
  brandName: string | null
  dosageForm: string | null
  route: string[]
  marketingCategory: string | null
  marketingStartDate: string | null
  marketingEndDate: string | null
  activeIngredients: Array<{ name: string | null; strength: string | null }>
  packages: Array<{
    ndc: string | null
    ndcPlain: string | null
    description: string | null
    marketingStartDate: string | null
    marketingEndDate: string | null
    sample: boolean | null
  }>
}

export interface LocalPackage {
  ndc: string
  ndcPlain: string
  description: string | null
  marketingStartDate: string | null
  marketingEndDate: string | null
  sample: boolean | null
}

export interface LocalNdcItem {
  productNdc: string
  productNdcPlain: string
  labelerName: string | null
  genericName: string | null
  brandName: string | null
  dosageForm: string | null
  route: string[]
  marketingCategory: string | null
  marketingStartDate: string | null
  marketingEndDate: string | null
  activeIngredients: Array<{ name: string | null; strength: string | null }>
  packages: LocalPackage[]
  searchTokens: string[]
}

export interface LocalNdcIndex {
  generatedAt: string
  items: LocalNdcItem[]
  productMap: Map<string, LocalNdcItem>
  packageMap: Map<string, { product: LocalNdcItem; pkg: LocalPackage }>
}

let indexPromise: Promise<LocalNdcIndex> | null = null

function createTokens(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

async function loadIndex(): Promise<LocalNdcIndex> {
  const fileUrl = new URL('./data/ndc-index.json.gz', import.meta.url)
  const buffer = await readFile(fileUrl)
  const decompressed = gunzipSync(buffer)
  const raw: RawNdcIndex = JSON.parse(decompressed.toString('utf8'))

  const items: LocalNdcItem[] = []
  const productMap = new Map<string, LocalNdcItem>()
  const packageMap = new Map<string, { product: LocalNdcItem; pkg: LocalPackage }>()

  for (const entry of raw.items) {
    if (!entry.productNdc) continue

    const productNdc = entry.productNdc
    const productNdcPlain = entry.productNdcPlain ?? normalizePlain(entry.productNdc) ?? null
    if (!productNdcPlain) continue

    const packages: LocalPackage[] = []
    for (const pkg of entry.packages ?? []) {
      if (!pkg.ndc) continue
      const ndc = pkg.ndc
      const ndcPlain = pkg.ndcPlain ?? normalizePlain(ndc)
      if (!ndcPlain) continue

      const localPkg: LocalPackage = {
        ndc,
        ndcPlain,
        description: pkg.description ?? null,
        marketingStartDate: pkg.marketingStartDate ?? null,
        marketingEndDate: pkg.marketingEndDate ?? null,
        sample: pkg.sample ?? null
      }
      packages.push(localPkg)
    }

    const searchTokens = new Set<string>()
    for (const token of createTokens(entry.genericName)) searchTokens.add(token)
    for (const token of createTokens(entry.brandName)) searchTokens.add(token)
    for (const token of createTokens(entry.dosageForm)) searchTokens.add(token)
    for (const ingredient of entry.activeIngredients ?? []) {
      for (const token of createTokens(ingredient.name)) searchTokens.add(token)
    }

    const item: LocalNdcItem = {
      productNdc,
      productNdcPlain,
      labelerName: entry.labelerName ?? null,
      genericName: entry.genericName ?? null,
      brandName: entry.brandName ?? null,
      dosageForm: entry.dosageForm ?? null,
      route: Array.isArray(entry.route) ? entry.route : [],
      marketingCategory: entry.marketingCategory ?? null,
      marketingStartDate: entry.marketingStartDate ?? null,
      marketingEndDate: entry.marketingEndDate ?? null,
      activeIngredients: entry.activeIngredients ?? [],
      packages,
      searchTokens: Array.from(searchTokens)
    }

    items.push(item)
    productMap.set(productNdcPlain, item)
    productMap.set(productNdc, item)

    for (const pkg of packages) {
      packageMap.set(pkg.ndcPlain, { product: item, pkg })
      packageMap.set(pkg.ndc, { product: item, pkg })
    }
  }

  return {
    generatedAt: raw.generatedAt,
    items,
    productMap,
    packageMap
  }
}

function normalizePlain(value: string | null): string | null {
  if (!value) return null
  const onlyDigits = value.replace(/\D/g, '')
  return onlyDigits || null
}

export async function getLocalNdcIndex(): Promise<LocalNdcIndex> {
  if (!indexPromise) {
    indexPromise = loadIndex()
  }
  return indexPromise
}

export async function findProductByNdc(ndc: string): Promise<LocalNdcItem | undefined> {
  const index = await getLocalNdcIndex()
  const normalized = normalizePlain(ndc) ?? normalizeNdc(ndc)
  return normalized ? index.productMap.get(normalized) : undefined
}

export async function findPackageByNdc(ndc: string) {
  const index = await getLocalNdcIndex()
  const normalized = normalizePlain(ndc) ?? normalizeNdc(ndc)
  return normalized ? index.packageMap.get(normalized) : undefined
}

