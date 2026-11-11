import type { AppSettings, SaveSettingsInput } from '../shared/types'

const SETTINGS_KEY = 'settings'
const API_KEY_KEY = 'secret.apiKey'

const DEFAULT_SETTINGS: AppSettings = {
  provider: 'deepseek',
  model: 'deepseek-chat',
  baseUrl: 'https://api.deepseek.com',
  targetLanguage: '简体中文',
  apiKeyConfigured: false,
  enabled: true,
}

export async function getSettings(): Promise<AppSettings> {
  const data = await chrome.storage.local.get([SETTINGS_KEY, API_KEY_KEY])
  const stored = (data[SETTINGS_KEY] as Partial<AppSettings> | undefined) ?? {}
  const apiKey = data[API_KEY_KEY]
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    provider: 'deepseek',
    apiKeyConfigured: typeof apiKey === 'string' && apiKey.length > 0,
  }
}

export async function getApiKey(): Promise<string> {
  const data = await chrome.storage.local.get(API_KEY_KEY)
  return typeof data[API_KEY_KEY] === 'string' ? data[API_KEY_KEY] : ''
}

export async function saveSettings(input: SaveSettingsInput): Promise<AppSettings> {
  const current = await getSettings()
  const merged: AppSettings = {
    ...current,
    model: input.model ?? current.model,
    baseUrl: input.baseUrl ?? current.baseUrl,
    targetLanguage: input.targetLanguage ?? current.targetLanguage,
    enabled: input.enabled ?? current.enabled,
  }

  if (input.apiKey === null) {
    await chrome.storage.local.remove(API_KEY_KEY)
  } else if (input.apiKey !== undefined && input.apiKey.length > 0) {
    await chrome.storage.local.set({ [API_KEY_KEY]: input.apiKey })
  }

  await chrome.storage.local.set({
    [SETTINGS_KEY]: {
      provider: merged.provider,
      model: merged.model,
      baseUrl: merged.baseUrl,
      targetLanguage: merged.targetLanguage,
      enabled: merged.enabled,
    },
  })

  return getSettings()
}
