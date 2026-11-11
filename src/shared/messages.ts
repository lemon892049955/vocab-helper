import type {
  Note,
  AppSettings,
  ReviewGrade,
  ReviewStatus,
  SaveNoteInput,
  SaveSettingsInput,
  TranslateInput,
  TranslateResult,
} from './types'

export interface ApiError {
  code: string
  message: string
}

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError }

export type ListNotesPayload = {
  query?: string
  noteType?: string
  reviewStatus?: string
}

export type RuntimeMessage =
  | { type: 'translate'; payload: TranslateInput }
  | { type: 'saveNote'; payload: SaveNoteInput }
  | { type: 'findNote'; payload: { original: string; type: string } }
  | { type: 'listNotes'; payload: ListNotesPayload }
  | { type: 'updateReview'; payload: { id: string; reviewStatus: ReviewStatus } }
  | { type: 'getDueNotes'; payload?: { limit?: number } }
  | { type: 'reviewNote'; payload: { id: string; grade: ReviewGrade } }
  | { type: 'deleteNote'; payload: { id: string } }
  | { type: 'getSettings' }
  | { type: 'saveSettings'; payload: SaveSettingsInput }
  | { type: 'clearCache' }
  | { type: 'openSettings' }
  | { type: 'testConnection' }

export type TestConnectionResult = { ok: boolean; message: string }
export type SaveNoteResult = { id: string; updated: boolean }
export type DeleteNoteResult = { deleted: boolean }
export type SaveSettingsResult = AppSettings

export function ok<T>(data: T): ApiResponse<T> {
  return { ok: true, data }
}

export function fail<T = never>(code: string, message: string): ApiResponse<T> {
  return { ok: false, error: { code, message } }
}

export function fromError<T = never>(error: unknown): ApiResponse<T> {
  if (error instanceof Error) {
    return fail<T>('UNKNOWN', error.message)
  }
  return fail<T>('UNKNOWN', String(error))
}

export function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ok' in value &&
    typeof (value as { ok?: unknown }).ok === 'boolean'
  )
}
