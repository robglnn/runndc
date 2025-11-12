import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import AdmZip from 'adm-zip'
import zlib from 'zlib'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const OUTPUT_PATH = path.resolve(__dirname, '../src/lib/data/ndc-index.json.gz')
const BASE64_TEXT_PATH = path.resolve(__dirname, '../src/lib/data/ndc-index.base64.txt')
const DATASET_URL = 'https://download.open.fda.gov/drug/ndc/drug-ndc-0001-of-0001.json.zip'

async function downloadDataset() {
  const res = await fetch(DATASET_URL, {
    headers: {
      'User-Agent': 'run-ndc-index-builder/1.0',
      'Accept': 'application/zip'
    }
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to download dataset (${res.status}): ${text}`)
  }

  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

function normalizePlain(value) {
  return value ? value.replace(/\D/g, '') : undefined
}

function mapResult(result) {
  return {
    productNdc: result.product_ndc ?? null,
    productNdcPlain: normalizePlain(result.product_ndc) ?? null,
    labelerName: result.labeler_name ?? null,
    genericName: result.generic_name ?? null,
    brandName: result.brand_name ?? null,
    dosageForm: result.dosage_form ?? null,
    route: Array.isArray(result.route) ? result.route : result.route ? [result.route] : [],
    marketingCategory: result.marketing_category ?? null,
    marketingStartDate: result.marketing_start_date ?? null,
    marketingEndDate: result.marketing_end_date ?? result.listing_expiration_date ?? null,
    activeIngredients: Array.isArray(result.active_ingredients)
      ? result.active_ingredients.map((item) => ({
          name: item.name ?? null,
          strength: item.strength ?? null
        }))
      : [],
    packages: Array.isArray(result.packaging)
      ? result.packaging.map((pkg) => ({
          ndc: pkg.package_ndc ?? null,
          ndcPlain: normalizePlain(pkg.package_ndc) ?? null,
          description: pkg.description ?? null,
          marketingStartDate: pkg.marketing_start_date ?? null,
          marketingEndDate: pkg.marketing_end_date ?? null,
          sample: pkg.sample ?? null
        }))
      : []
  }
}

async function buildIndex() {
  console.log('Building local NDC index from openFDA…')
  const items = []

  const startedAt = Date.now()

  const zipBuffer = await downloadDataset()
  const zip = new AdmZip(zipBuffer)
  const entries = zip.getEntries()
  if (!entries.length) {
    throw new Error('Downloaded archive contained no entries')
  }

  const entry = entries[0]
  const parsed = JSON.parse(entry.getData().toString('utf8'))
  if (!Array.isArray(parsed.results)) {
    throw new Error('Unexpected dataset format: missing results array')
  }

  for (const result of parsed.results) {
    items.push(mapResult(result))
  }

  const output = {
    generatedAt: new Date().toISOString(),
    total: items.length,
    source: 'openfda_download',
    items
  }

  await fs.promises.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  const serialized = JSON.stringify(output)
  const compressed = zlib.gzipSync(serialized)
  await fs.promises.writeFile(OUTPUT_PATH, compressed)

  const base64 = compressed.toString('base64')
  await fs.promises.writeFile(BASE64_TEXT_PATH, base64)

  const duration = ((Date.now() - startedAt) / 1000).toFixed(1)
  const sizeMb = (compressed.length / (1024 * 1024)).toFixed(2)
  console.log(`Wrote ${items.length} entries to ${OUTPUT_PATH} (${sizeMb} MB) in ${duration}s`)
}

buildIndex().catch((err) => {
  console.error(err)
  process.exit(1)
})

