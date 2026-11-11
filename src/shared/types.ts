export type NoteType = 'word' | 'phrase' | 'sentence'
export type ReviewStatus = 'new' | 'learning' | 'known'
export type ReviewGrade = 'forgot' | 'fuzzy' | 'known'

export interface KeyWord {
  word: string
  meaning: string
}

export interface Note {
  id: string
  type: NoteType
  original: string
  translation: string
  phonetic?: string
  partOfSpeech?: string
  exampleOriginal?: string
  exampleTranslation?: string
  contextSentence?: string
  sourceUrl?: string
  sourceTitle?: string
  tags: string[]
  targetLanguage: string
  reviewStatus: ReviewStatus
  reviewCount: number
  intervalDays: number
  dueAt: number
  easeFactor?: number
  lapses?: number
  lastReviewedAt?: number
  createdAt: number
  updatedAt: number
  model: string
}

export interface TranslateInput {
  text: string
  type: NoteType
  targetLanguage?: string
}

export interface TranslateResult {
  original: string
  type: NoteType
  targetLanguage: string
  translation: string
  phonetic?: string
  partOfSpeech?: string
  exampleOriginal?: string
  exampleTranslation?: string
  keyWords?: KeyWord[]
  model: string
  cached: boolean
}

export interface WordLookupResult {
  found: boolean
  original: string
  source?: 'local' | 'ai'
  translation?: string
  phonetic?: string
  partOfSpeech?: string
  exampleOriginal?: string
  exampleTranslation?: string
  model?: string
  message?: string
}

export interface SaveNoteInput {
  type: NoteType
  original: string
  translation: string
  phonetic?: string
  partOfSpeech?: string
  exampleOriginal?: string
  exampleTranslation?: string
  contextSentence?: string
  sourceUrl?: string
  sourceTitle?: string
  targetLanguage: string
  model: string
  tags?: string[]
}

export interface AppSettings {
  provider: 'deepseek'
  model: string
  baseUrl: string
  targetLanguage: string
  apiKeyConfigured: boolean
  enabled: boolean
}

export interface SaveSettingsInput {
  provider?: 'deepseek'
  model?: string
  baseUrl?: string
  targetLanguage?: string
  apiKey?: string | null
  enabled?: boolean
}
