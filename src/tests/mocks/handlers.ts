import { http, HttpResponse } from 'msw'

const today = new Date()
const future = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate())
const futureStr = future.toISOString().split('T')[0]

export const handlers = [
  http.get('https://rxnav.nlm.nih.gov/REST/rxcui.json', ({ request }) => {
    const url = new URL(request.url)
    const name = url.searchParams.get('name')?.toLowerCase() ?? ''

    if (name.includes('lasix')) {
      return HttpResponse.json({
        idGroup: { rxnormId: ['12345', '67890'], name: 'Lasix' }
      })
    }

    if (name.includes('ibuprofen')) {
      return HttpResponse.json({
        idGroup: { rxnormId: ['55555'], name: 'Ibuprofen' }
      })
    }

    return HttpResponse.json({ idGroup: {} })
  }),

  http.get('https://rxnav.nlm.nih.gov/REST/rxcui/:id/property.json', ({ params }) => {
    const id = params.id as string
    if (id === '12345' || id === '55555') {
      return HttpResponse.json({
        propConcept: { propValue: 'IN' }
      })
    }

    return HttpResponse.json({
      propConcept: { propValue: 'SCD' }
    })
  }),

  http.get('https://api.fda.gov/drug/ndc.json', ({ request }) => {
    const url = new URL(request.url)
    const search = url.searchParams.get('search') ?? ''

    if (search.includes('rxcui.exact:12345')) {
      return HttpResponse.json({
        results: [
          {
            product_ndc: '12345-6789',
            labeler_name: 'Function Health Labs',
            generic_name: 'Lasix 40 mg tablet',
            packaging: [
              {
                package_ndc: '12345-6789-01',
                description: 'Bottle of 60 tablet',
                marketing_end_date: null
              }
            ]
          },
          {
            product_ndc: '12345-6790',
            labeler_name: 'Function Health Labs',
            marketing_end_date: '2019-01-01',
            packaging: [
              {
                package_ndc: '12345-6790-01',
                description: 'Bottle of 120 tablet'
              }
            ]
          }
        ]
      })
    }

    if (search.includes('rxcui.exact:55555')) {
      return HttpResponse.json({
        results: [
          {
            product_ndc: '55555-010',
            labeler_name: 'Found Health',
            generic_name: 'Ibuprofen 200 mg tablet',
            packaging: [
              {
                package_ndc: '55555-010-30',
                description: 'Carton of 30 tablet'
              }
            ]
          }
        ]
      })
    }

    if (search.includes('package_ndc.exact')) {
      return HttpResponse.json({
        results: [
          {
            product_ndc: '77777-123',
            labeler_name: 'Demo Labs',
            generic_name: 'Demo Drug 100 mg',
            packaging: [
              {
                package_ndc: '77777-123-01',
                description: 'Bottle of 100 tablet',
                marketing_end_date: futureStr
              }
            ]
          }
        ]
      })
    }

    return HttpResponse.json({ results: [] })
  })
]

