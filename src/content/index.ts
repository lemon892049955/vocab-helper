import type { ApiResponse, RuntimeMessage } from '../shared/messages'
import type { SaveNoteInput, TranslateInput, TranslateResult } from '../shared/types'
import { ensureDictionary, lookupLocal } from '../shared/dictionary'
import type { LocalEntry } from '../shared/dictionary'
import { speak } from '../shared/speech'
import { classifyText, normalizeText, truncate } from '../shared/utils'
import { Tooltip } from './tooltip'

const tooltip = new Tooltip()

const SETTINGS_KEY = 'settings'

let extensionEnabled = true

async function loadEnabledState(): Promise<void> {
  try {
    const data = await chrome.storage.local.get(SETTINGS_KEY)
    const stored = data[SETTINGS_KEY] as { enabled?: boolean } | undefined
    extensionEnabled = stored?.enabled !== false
  } catch {
    extensionEnabled = true
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[SETTINGS_KEY]) {
    const newValue = changes[SETTINGS_KEY].newValue as { enabled?: boolean } | undefined
    extensionEnabled = newValue?.enabled !== false
    if (!extensionEnabled) {
      tooltip.hide()
    }
  }
})

void loadEnabledState()
void ensureDictionary()

function sendRuntimeMessage<T>(message: RuntimeMessage): Promise<ApiResponse<T> | undefined> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: unknown) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          error: { code: 'RUNTIME', message: chrome.runtime.lastError.message ?? '运行时错误' },
        })
        return
      }
      resolve(response as ApiResponse<T>)
    })
  })
}

function getContextSentence(): string | undefined {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return undefined
  const node = selection.getRangeAt(0).commonAncestorContainer
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement
  if (!element) return undefined
  const text = normalizeText(element.innerText ?? '')
  if (!text) return undefined
  return truncate(text, 500)
}

async function handleSelection(event: MouseEvent): Promise<void> {
  if (tooltip.isFromSelf(event)) return
  if (!extensionEnabled) return

  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) {
    tooltip.hide()
    return
  }

  const original = normalizeText(selection.toString())
  if (!original) {
    tooltip.hide()
    return
  }

  const type = classifyText(original)
  const range = selection.getRangeAt(0)
  const rect = range.getBoundingClientRect()

  // 1. 本地词典秒回（内置高频词，离线可用）
  await ensureDictionary()
  const local = lookupLocal(original)
  if (local) {
    tooltip.showAt(rect)
    tooltip.renderLocal(
      original,
      local,
      () => void saveFromLocal(original, type, local),
      () => void speakText(original),
    )
  } else {
    tooltip.showLoadingAt(rect)
  }

  // 2. AI 翻译：成功则升级为完整卡片；失败/未配置 Key 则保留本地卡兜底
  const response = await sendRuntimeMessage<TranslateResult>({
    type: 'translate',
    payload: { text: truncate(original, 2000), type },
  })
  const result = response?.ok ? response.data : null

  if (result?.translation) {
    const existing = await sendRuntimeMessage<{ id: string } | null>({
      type: 'findNote',
      payload: { original, type },
    })
    const savedId = existing?.ok ? (existing.data?.id ?? null) : null
    tooltip.renderResult(
      result,
      () => void saveSelection(original, type, result),
      () => void speakText(original),
      savedId !== null,
      savedId ? () => void removeNote(savedId) : undefined,
    )
    return
  }

  // 本地卡已经显示，直接保留作兜底；只有本地也没有命中时才走错误提示
  if (local) return

  if (response && !response.ok && response.error?.code === 'NO_API_KEY') {
    tooltip.renderError('尚未配置 DeepSeek API Key，无法翻译。', [
      { label: '打开设置页', primary: true, onClick: () => void openSettings() },
      { label: '关闭', onClick: () => tooltip.hide() },
    ])
    return
  }
  const message =
    response && !response.ok
      ? (response.error?.message ?? '翻译失败，请稍后重试。')
      : '没有获得有效的翻译结果。'
  tooltip.renderError(message)
}

async function saveFromLocal(
  original: string,
  type: SaveNoteInput['type'],
  local: LocalEntry,
): Promise<void> {
  const input: SaveNoteInput = {
    type,
    original,
    translation: local.translation,
    phonetic: local.phonetic,
    partOfSpeech: local.pos,
    contextSentence: getContextSentence(),
    sourceUrl: window.location.href,
    sourceTitle: document.title,
    targetLanguage: '简体中文',
    model: 'local',
  }

  const response = await sendRuntimeMessage<{ id: string; updated: boolean }>({
    type: 'saveNote',
    payload: input,
  })

  if (response?.ok) {
    tooltip.showNotice(response.data.updated ? '已更新到生词本' : '已收藏到生词本')
  } else {
    tooltip.renderError(response?.error?.message ?? '收藏失败')
  }
}

async function removeNote(id: string): Promise<void> {
  const response = await sendRuntimeMessage<{ deleted: boolean }>({
    type: 'deleteNote',
    payload: { id },
  })
  if (response?.ok) {
    tooltip.showNotice('已从生词本移除')
  } else {
    tooltip.renderError(response?.error?.message ?? '移除失败')
  }
}

async function openSettings(): Promise<void> {
  const response = await sendRuntimeMessage<{ opened: boolean }>({ type: 'openSettings' })
  if (!response?.ok) {
    tooltip.renderError(response?.error?.message ?? '打开设置页失败')
    return
  }
  tooltip.showNotice('已在新标签页打开设置')
}

async function speakText(text: string): Promise<void> {
  const result = speak(text, 'en-US')
  if (!result.ok) {
    tooltip.showNotice(result.message)
  }
}

async function saveSelection(
  original: string,
  type: SaveNoteInput['type'],
  result: TranslateResult,
): Promise<void> {
  const input: SaveNoteInput = {
    type,
    original,
    translation: result.translation,
    phonetic: result.phonetic,
    partOfSpeech: result.partOfSpeech,
    exampleOriginal: result.exampleOriginal,
    exampleTranslation: result.exampleTranslation,
    contextSentence: getContextSentence(),
    sourceUrl: window.location.href,
    sourceTitle: document.title,
    targetLanguage: result.targetLanguage,
    model: result.model,
  }

  const response = await sendRuntimeMessage<{ id: string; updated: boolean }>({
    type: 'saveNote',
    payload: input,
  })

  if (response?.ok) {
    tooltip.showNotice(response.data.updated ? '已更新到生词本' : '已收藏到生词本')
  } else {
    tooltip.renderError(response?.error?.message ?? '收藏失败')
  }
}

document.addEventListener('mouseup', (event) => {
  void handleSelection(event)
}, true)

document.addEventListener('scroll', () => tooltip.hide(), true)
