import type { AppSettings, KeyWord, TranslateInput, TranslateResult } from '../../shared/types'
import { ProviderError, type TranslationProvider } from './types'

type RawWordResult = {
  translation?: string
  meaning?: string
  phonetic?: string
  partOfSpeech?: string
  exampleOriginal?: string
  exampleTranslation?: string
  keyWords?: KeyWord[]
}

const DEFAULT_MODEL = 'deepseek-chat'

function buildSystemPrompt(targetLanguage: string): string {
  return [
    '你是一名英语学习助手，请把用户输入的英文翻译成' + targetLanguage + '。',
    '只输出一个 JSON 对象，不要输出 Markdown、解释或任何额外文字。',
    '如果是单词或短语，使用格式：',
    '{"translation":"中文释义","phonetic":"音标","partOfSpeech":"词性","exampleOriginal":"英文例句","exampleTranslation":"例句中文翻译"}',
    '如果是句子，使用格式：',
    '{"translation":"整句中文翻译","keyWords":[{"word":"重点词或短语","meaning":"其中文释义"}]}',
  ].join('\n')
}

function parseJsonObject(content: string): RawWordResult {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()

  try {
    const parsed = JSON.parse(cleaned) as RawWordResult
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export class DeepSeekProvider implements TranslationProvider {
  async translate(
    input: TranslateInput,
    settings: AppSettings,
    apiKey: string,
  ): Promise<TranslateResult> {
    if (!apiKey) {
      throw new ProviderError('NO_API_KEY', '请先在插件设置中填写 DeepSeek API Key。')
    }

    const targetLanguage = input.targetLanguage || settings.targetLanguage || '简体中文'
    const baseUrl = (settings.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '')
    const model = settings.model || DEFAULT_MODEL

    let response: Response
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: buildSystemPrompt(targetLanguage) },
            { role: 'user', content: input.text },
          ],
        }),
      })
    } catch (error) {
      throw new ProviderError('NETWORK', '请求翻译服务失败，请检查网络或 Base URL。')
    }

    if (!response.ok) {
      const body = await response.text()
      let message = body
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string } }
        message = parsed.error?.message ?? message
      } catch {
        // keep raw body
      }

      if (response.status === 401) {
        throw new ProviderError('AUTH', 'API Key 无效，请在设置中检查。')
      }
      if (response.status === 402) {
        throw new ProviderError('PAYMENT_REQUIRED', 'DeepSeek 账户余额不足。')
      }
      if (response.status === 429) {
        throw new ProviderError('RATE_LIMITED', '请求过于频繁，请稍后再试。')
      }
      throw new ProviderError('API_ERROR', `翻译服务错误（${response.status}）：${message}`)
    }

    let json: {
      choices?: { message?: { content?: string } }[]
    }
    try {
      json = (await response.json()) as typeof json
    } catch {
      throw new ProviderError('BAD_RESPONSE', '翻译服务返回了无法解析的内容。')
    }

    const content = json.choices?.[0]?.message?.content ?? ''
    if (!content.trim()) {
      throw new ProviderError('BAD_RESPONSE', '翻译服务未返回内容。')
    }

    return this.normalize(input, parseJsonObject(content), targetLanguage, model)
  }

  private normalize(
    input: TranslateInput,
    raw: RawWordResult,
    targetLanguage: string,
    model: string,
  ): TranslateResult {
    const translation = (raw.translation || raw.meaning || '').trim()
    if (!translation) {
      throw new ProviderError('BAD_RESPONSE', '翻译结果格式异常，请重试。')
    }

    if (input.type === 'word') {
      return {
        original: input.text,
        type: input.type,
        targetLanguage,
        translation,
        phonetic: raw.phonetic,
        partOfSpeech: raw.partOfSpeech,
        exampleOriginal: raw.exampleOriginal,
        exampleTranslation: raw.exampleTranslation,
        model,
        cached: false,
      }
    }

    return {
      original: input.text,
      type: input.type,
      targetLanguage,
      translation,
      keyWords: Array.isArray(raw.keyWords) ? raw.keyWords : undefined,
      model,
      cached: false,
    }
  }
}
