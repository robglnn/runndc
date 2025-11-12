export interface ParsedPackageSize {
  size: number
  unit: string
}

const UNIT_MAP: Record<string, string> = {
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
  aerosol: 'puff',
  aerosols: 'puff',
  metered: 'puff',
  inhaler: 'inhaler',
  inhalers: 'inhaler',
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

export function parsePackageDescription(description?: string | null): ParsedPackageSize | null {
  if (!description) return null

  const matches = [...description.matchAll(/(\d+(?:\.\d+)?)\s*([A-Za-z\[\]\-]+)/gi)]

  for (const match of matches) {
    const size = Number(match[1])
    const rawUnit = match[2].toLowerCase()
    const normalized = UNIT_MAP[rawUnit]
    if (!Number.isNaN(size) && normalized) {
      return { size, unit: normalized }
    }
  }

  return null
}

