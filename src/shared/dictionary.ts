export interface LocalEntry {
  word: string
  translation: string
  phonetic?: string
  pos?: string
}

const DICT_URL = 'dict/en-zh-basic.json'

let dict: Map<string, LocalEntry> | null = null
let loadingPromise: Promise<void> | null = null

function load(): Promise<void> {
  if (loadingPromise) return loadingPromise
  loadingPromise = (async () => {
    try {
      const url = chrome.runtime.getURL(DICT_URL)
      const response = await fetch(url)
      if (!response.ok) throw new Error(`dict load failed: ${response.status}`)
      const entries = (await response.json()) as LocalEntry[]
      dict = new Map(entries.map((entry) => [entry.word.toLowerCase(), entry]))
    } catch {
      dict = new Map()
    }
  })()
  return loadingPromise
}

export function ensureDictionary(): Promise<void> {
  if (dict) return Promise.resolve()
  return load()
}

export function lookupLocal(word: string): LocalEntry | null {
  if (!dict) return null
  return dict.get(word.toLowerCase()) ?? null
}
