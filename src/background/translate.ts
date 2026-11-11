import type { TranslateInput, TranslateResult } from '../shared/types'
import { getCached, makeCacheKey, setCached } from './cache'
import { createProvider } from './provider'
import { ProviderError } from './provider/types'
import { getApiKey, getSettings } from './settings'

export async function translate(input: TranslateInput): Promise<TranslateResult> {
  const settings = await getSettings()
  const apiKey = await getApiKey()

  if (!apiKey) {
    throw new ProviderError('NO_API_KEY', '请先在插件设置中填写 DeepSeek API Key。')
  }

  const targetLanguage = input.targetLanguage || settings.targetLanguage || '简体中文'
  const model = settings.model || 'deepseek-chat'
  const cacheKey = await makeCacheKey(input.text, model, targetLanguage)

  const cached = await getCached(cacheKey)
  if (cached?.translation) {
    return { ...cached, cached: true }
  }

  const provider = createProvider(settings)
  const result = await provider.translate({ ...input, targetLanguage }, settings, apiKey)
  await setCached(cacheKey, result)
  return result
}
