import OpenAI from 'openai'
import { OPENAI_API_KEY } from '$env/static/private'

let client: OpenAI | null = null

export function getOpenAIClient(): OpenAI | null {
  if (!OPENAI_API_KEY) return null
  if (!client) {
    client = new OpenAI({ apiKey: OPENAI_API_KEY })
  }

  return client
}

