import type { TranslateResult } from '../shared/types'
import { normalizeText } from '../shared/utils'

const PREFIX = 'cache:'

export async function getCached(key: string): Promise<TranslateResult | null> {
  const data = await chrome.storage.local.get(key)
  const value = data[key]
  return value && typeof value === 'object' ? (value as TranslateResult) : null
}

export async function setCached(key: string, value: TranslateResult): Promise<void> {
  await chrome.storage.local.set({ [key]: value })
}

export async function makeCacheKey(
  text: string,
  model: string,
  targetLanguage: string,
): Promise<string> {
  const raw = `${normalizeText(text)}\u0000${model}\u0000${targetLanguage}`
  const bytes = new TextEncoder().encode(raw)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hex = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return `${PREFIX}${hex}`
}

export async function clearTranslationCache(): Promise<void> {
  const all = await chrome.storage.local.get(null)
  const keys = Object.keys(all).filter((key) => key.startsWith(PREFIX))
  if (keys.length > 0) {
    await chrome.storage.local.remove(keys)
  }
}
