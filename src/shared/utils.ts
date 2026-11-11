import type { NoteType } from './types'

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function classifyText(text: string): NoteType {
  const normalized = normalizeText(text)
  if (!normalized) return 'sentence'

  const words = normalized.match(/[A-Za-z0-9'’-]+/g) ?? []
  if (words.length <= 1) return 'word'
  if (words.length <= 5) return 'phrase'
  return 'sentence'
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trim()}…`
}

export function toCsvValue(value: string | number | undefined): string {
  if (value === undefined || value === null) return ''
  const text = String(value)
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
