import { fail, fromError, ok } from '../shared/messages'
import type { ApiResponse, RuntimeMessage } from '../shared/messages'
import { clearTranslationCache } from './cache'
import { deleteNote, findNote, getDueNotes, listNotes, reviewNote, saveNote, updateReview } from './notes'
import { lookupWord } from './lookup'
import { ProviderError } from './provider/types'
import { getSettings, saveSettings } from './settings'
import { translate } from './translate'

function errorResponse(error: unknown): ApiResponse<never> {
  if (error instanceof ProviderError) {
    return fail(error.code, error.message)
  }
  return fromError(error)
}

async function openSettingsPage(): Promise<boolean> {
  await chrome.tabs.create({ url: chrome.runtime.getURL('index.html') })
  return true
}

async function handleMessage(message: RuntimeMessage): Promise<ApiResponse<unknown>> {
  switch (message.type) {
    case 'translate':
      return ok(await translate(message.payload))
    case 'lookupWord':
      return ok(await lookupWord(message.payload.word))
    case 'saveNote':
      return ok(await saveNote(message.payload))
    case 'findNote':
      return ok(await findNote(message.payload.original, message.payload.type))
    case 'listNotes':
      return ok(await listNotes(message.payload))
    case 'updateReview': {
      const note = await updateReview(message.payload.id, message.payload.reviewStatus)
      return note ? ok(note) : fail('NOT_FOUND', '没有找到这条笔记')
    }
    case 'getDueNotes':
      return ok(await getDueNotes(message.payload?.limit ?? 20))
    case 'reviewNote': {
      const note = await reviewNote(message.payload.id, message.payload.grade)
      return note ? ok(note) : fail('NOT_FOUND', '没有找到这条笔记')
    }
    case 'deleteNote':
      return ok(await deleteNote(message.payload.id))
    case 'getSettings':
      return ok(await getSettings())
    case 'saveSettings':
      return ok(await saveSettings(message.payload))
    case 'clearCache':
      await clearTranslationCache()
      return ok({ cleared: true })
    case 'openSettings':
      return ok({ opened: await openSettingsPage() })
    case 'testConnection': {
      const settings = await getSettings()
      const result = await translate({
        text: 'hello',
        type: 'word',
        targetLanguage: settings.targetLanguage,
      })
      return ok({ ok: true, message: `连接成功：hello → ${result.translation}` })
    }
    default:
      return fail('BAD_REQUEST', '未知的消息类型')
  }
}

chrome.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
  const message = rawMessage as RuntimeMessage
  handleMessage(message)
    .then((response) => sendResponse(response))
    .catch((error) => sendResponse(errorResponse(error)))
  return true
})
