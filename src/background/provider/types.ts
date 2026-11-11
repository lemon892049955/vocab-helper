import type { AppSettings, TranslateInput, TranslateResult } from '../../shared/types'

export interface TranslationProvider {
  translate(
    input: TranslateInput,
    settings: AppSettings,
    apiKey: string,
  ): Promise<TranslateResult>
}

export class ProviderError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ProviderError'
    this.code = code
  }
}
