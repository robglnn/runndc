export interface SyntheticScenario {
  id: string
  label: string
  drug: string
  sig: string
  days: number
  note?: string
}

export const syntheticScenarios: SyntheticScenario[] = [
  {
    id: 'lasix-qd',
    label: 'Lasix 40 mg qd ×30',
    drug: 'Lasix 40 mg tablet',
    sig: 'Take 1 tablet daily',
    days: 30
  },
  {
    id: 'ibuprofen-bid',
    label: 'Ibuprofen 200 mg BID ×30',
    drug: 'Ibuprofen 200 mg tablet',
    sig: 'Take 1 tablet twice daily',
    days: 30
  },
  {
    id: 'metformin-tid',
    label: 'Metformin 500 mg TID ×90',
    drug: 'Metformin 500 mg tablet',
    sig: 'Take 1 tablet three times daily',
    days: 90
  },
  {
    id: 'albuterol-prn',
    label: 'Albuterol inhaler PRN',
    drug: 'Albuterol sulfate inhaler',
    sig: 'Inhale 2 puffs every 6 hours as needed (PRN)',
    days: 30,
    note: 'Exercises PRN warning parsing'
  },
  {
    id: 'ndc-direct',
    label: '50242004062 direct NDC',
    drug: '50242-0040-62',
    sig: 'Take 1 tablet daily',
    days: 30,
    note: 'Validates 11-digit normalization'
  }
]

