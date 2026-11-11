import type { ListNotesPayload } from '../shared/messages'
import type { Note, ReviewGrade, ReviewStatus, SaveNoteInput } from '../shared/types'
import { createId, normalizeText } from '../shared/utils'

const NOTES_KEY = 'notes'

async function readNotes(): Promise<Note[]> {
  const data = await chrome.storage.local.get(NOTES_KEY)
  const value = data[NOTES_KEY]
  return Array.isArray(value) ? (value as Note[]) : []
}

async function writeNotes(notes: Note[]): Promise<void> {
  await chrome.storage.local.set({ [NOTES_KEY]: notes })
}

export async function listNotes(payload: ListNotesPayload = {}): Promise<Note[]> {
  const notes = await readNotes()
  const query = payload.query ? normalizeText(payload.query).toLowerCase() : ''

  const filtered = notes.filter((note) => {
    if (payload.noteType && payload.noteType !== 'all' && note.type !== payload.noteType) return false
    if (payload.reviewStatus && payload.reviewStatus !== 'all' && note.reviewStatus !== payload.reviewStatus) return false
    if (!query) return true

    const haystack = [note.original, note.translation, note.contextSentence ?? '', note.tags.join(' ')]
      .join(' ')
      .toLowerCase()
    return haystack.includes(query)
  })

  return filtered.sort((a, b) => b.createdAt - a.createdAt)
}

export async function findNote(
  original: string,
  type: string,
): Promise<{ id: string } | null> {
  const notes = await readNotes()
  const target = normalizeText(original).toLowerCase()
  const found = notes.find(
    (note) => note.original.toLowerCase() === target && note.type === type,
  )
  return found ? { id: found.id } : null
}

export async function saveNote(input: SaveNoteInput): Promise<{ id: string; updated: boolean }> {
  const notes = await readNotes()
  const now = Date.now()
  const tags = Array.from(new Set(input.tags ?? []))

  const existingIndex = notes.findIndex(
    (note) =>
      note.type === input.type && note.original.toLowerCase() === input.original.toLowerCase(),
  )

  if (existingIndex >= 0) {
    const existing = notes[existingIndex]
    const updated: Note = {
      ...existing,
      translation: input.translation || existing.translation,
      phonetic: input.phonetic ?? existing.phonetic,
      partOfSpeech: input.partOfSpeech ?? existing.partOfSpeech,
      exampleOriginal: input.exampleOriginal ?? existing.exampleOriginal,
      exampleTranslation: input.exampleTranslation ?? existing.exampleTranslation,
      contextSentence: input.contextSentence ?? existing.contextSentence,
      sourceUrl: input.sourceUrl ?? existing.sourceUrl,
      sourceTitle: input.sourceTitle ?? existing.sourceTitle,
      targetLanguage: input.targetLanguage,
      model: input.model,
      tags: Array.from(new Set([...existing.tags, ...tags])),
      updatedAt: now,
    }
    notes[existingIndex] = updated
    await writeNotes(notes)
    return { id: existing.id, updated: true }
  }

  const note: Note = {
    id: createId(),
    type: input.type,
    original: input.original,
    translation: input.translation,
    phonetic: input.phonetic,
    partOfSpeech: input.partOfSpeech,
    exampleOriginal: input.exampleOriginal,
    exampleTranslation: input.exampleTranslation,
    contextSentence: input.contextSentence,
    sourceUrl: input.sourceUrl,
    sourceTitle: input.sourceTitle,
    tags,
    targetLanguage: input.targetLanguage,
    reviewStatus: 'new',
    reviewCount: 0,
    intervalDays: 0,
    dueAt: now,
    createdAt: now,
    updatedAt: now,
    model: input.model,
  }

  notes.push(note)
  await writeNotes(notes)
  return { id: note.id, updated: false }
}

const DAY_MS = 24 * 60 * 60 * 1000
const MIN_EASE = 1.3
const DEFAULT_EASE = 2.5
const MAX_INTERVAL_DAYS = 365
const RETRY_DELAY_MS = 10 * 60 * 1000

const GRADE_QUALITY: Record<ReviewGrade, number> = {
  forgot: 1,
  fuzzy: 3,
  known: 5,
}

function nextEase(ease: number, quality: number): number {
  const delta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
  return Math.max(MIN_EASE, Math.round((ease + delta) * 100) / 100)
}

function initialIntervalDays(reps: number, prevInterval: number, ease: number): number {
  if (reps === 0) return 1
  if (reps === 1) return 6
  return Math.round(Math.max(prevInterval, 1) * ease)
}

export async function getDueNotes(limit = 20): Promise<Note[]> {
  const notes = await readNotes()
  const now = Date.now()
  return notes
    .filter((note) => (note.dueAt ?? now) <= now)
    .sort((a, b) => (a.dueAt ?? now) - (b.dueAt ?? now))
    .slice(0, limit)
}

export async function reviewNote(id: string, grade: ReviewGrade): Promise<Note | null> {
  const notes = await readNotes()
  const index = notes.findIndex((note) => note.id === id)
  if (index < 0) return null

  const note = notes[index]
  const now = Date.now()

  const quality = GRADE_QUALITY[grade]
  const prevInterval = Math.max(0, note.intervalDays ?? 0)
  const prevEase = note.easeFactor ?? DEFAULT_EASE
  const ease = nextEase(prevEase, quality)
  const reps = note.reviewCount ?? 0

  let intervalDays: number
  let reviewStatus: ReviewStatus
  let lapses = note.lapses ?? 0

  if (grade === 'forgot') {
    lapses += 1
    intervalDays = 0
    reviewStatus = 'learning'
  } else if (grade === 'fuzzy') {
    intervalDays = Math.min(
      MAX_INTERVAL_DAYS,
      Math.max(1, Math.round(Math.max(prevInterval, 1) * 1.2)),
    )
    reviewStatus = 'learning'
  } else {
    intervalDays = Math.min(
      MAX_INTERVAL_DAYS,
      Math.max(1, initialIntervalDays(reps, prevInterval, ease)),
    )
    reviewStatus = 'known'
  }

  const dueAt = grade === 'forgot' ? now + RETRY_DELAY_MS : now + intervalDays * DAY_MS

  const updated: Note = {
    ...note,
    reviewStatus,
    reviewCount: reps + 1,
    intervalDays,
    easeFactor: ease,
    lapses,
    lastReviewedAt: now,
    dueAt,
    updatedAt: now,
  }

  notes[index] = updated
  await writeNotes(notes)
  return updated
}

export async function updateReview(id: string, reviewStatus: ReviewStatus): Promise<Note | null> {
  const notes = await readNotes()
  const index = notes.findIndex((note) => note.id === id)
  if (index < 0) return null

  const note = notes[index]
  const now = Date.now()
  const reps = note.reviewCount ?? 0
  const prevInterval = Math.max(0, note.intervalDays ?? 0)
  const ease = note.easeFactor ?? DEFAULT_EASE

  let intervalDays: number
  let dueAt: number

  if (reviewStatus === 'known') {
    intervalDays = Math.min(
      MAX_INTERVAL_DAYS,
      Math.max(1, initialIntervalDays(reps, prevInterval, ease)),
    )
    dueAt = now + intervalDays * DAY_MS
  } else if (reviewStatus === 'learning') {
    intervalDays = 1
    dueAt = now + DAY_MS
  } else {
    intervalDays = 0
    dueAt = now
  }

  notes[index] = {
    ...notes[index],
    reviewStatus,
    intervalDays,
    dueAt,
    updatedAt: now,
  }
  await writeNotes(notes)
  return notes[index]
}

export async function deleteNote(id: string): Promise<{ deleted: boolean }> {
  const notes = await readNotes()
  const next = notes.filter((note) => note.id !== id)
  if (next.length === notes.length) return { deleted: false }
  await writeNotes(next)
  return { deleted: true }
}
