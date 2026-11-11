import type { WordLookupResult } from '../shared/types'
import { ensureDictionary, lookupLocal } from '../shared/dictionary'
import { ProviderError } from './provider/types'
import { translate } from './translate'

/**
 * 词典查词：先走离线词典秒回；离线未命中再调用 AI 翻译兜底。
 * 离线命中时 source='local'（不消耗 API）；AI 命中时 source='ai'。
 */
export async function lookupWord(word: string): Promise<WordLookupResult> {
  const normalized = word.trim()
  if (!normalized) {
    return { found: false, original: normalized }
  }

  await ensureDictionary()
  const local = lookupLocal(normalized)
  if (local) {
    return {
      found: true,
      source: 'local',
      original: normalized,
      translation: local.translation,
      phonetic: local.phonetic,
      partOfSpeech: local.pos,
      model: 'local',
    }
  }

  try {
    const result = await translate({ text: normalized, type: 'word' })
    return {
      found: true,
      source: 'ai',
      original: result.original,
      translation: result.translation,
      phonetic: result.phonetic,
      partOfSpeech: result.partOfSpeech,
      exampleOriginal: result.exampleOriginal,
      exampleTranslation: result.exampleTranslation,
      model: result.model,
    }
  } catch (error) {
    if (error instanceof ProviderError && error.code === 'NO_API_KEY') {
      return {
        found: false,
        original: normalized,
        message: '离线词典未收录该词，且未配置 API Key，无法联网查询。',
      }
    }
    const message = error instanceof Error ? error.message : '查询失败，请稍后重试。'
    return { found: false, original: normalized, message }
  }
}
