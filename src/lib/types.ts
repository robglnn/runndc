export interface CalcRequest {
  drug: string
  sig: string
  days: number
}

export interface NdcPackage {
  ndc: string
  formattedNdc: string
  size: number
  unit: string
  inactive: boolean
  description: string
  labelerName?: string
  packageDescription?: string
}

export interface ParsedSig {
  dose: number
  unit: string
  frequencyPerDay: number
  route?: string
  prn: boolean
  raw?: Record<string, unknown>
  source: 'regex' | 'openai'
}

export interface SelectedNdc extends NdcPackage {
  packs: number
  dispensedQty: number
  overfillPct: number
}

export interface CalcResult {
  ndcs: SelectedNdc[]
  totalQty: number
  dispensedQty: number
  overfillPct: number
  warnings: string[]
  json: string
  parsedSig?: ParsedSig
}

export interface OverageGuidance {
  min: number
  max: number
  allowancePercent?: number
  allowanceUnits?: number
  notes: string
}

