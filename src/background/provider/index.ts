import type { AppSettings } from '../../shared/types'
import { DeepSeekProvider } from './deepseek'
import type { TranslationProvider } from './types'

export function createProvider(settings: AppSettings): TranslationProvider {
  if (settings.provider === 'deepseek') {
    return new DeepSeekProvider()
  }
  throw new Error(`Unsupported provider: ${String(settings.provider)}`)
}
