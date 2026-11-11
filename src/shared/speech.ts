export type SpeakResult = { ok: true } | { ok: false; message: string }

function chromeTtsAvailable(): boolean {
  return typeof chrome !== 'undefined' && typeof chrome.tts !== 'undefined'
}

function webSpeechAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined'
}

/**
 * chrome.tts 在 MV3 service worker 中不可用，因此朗读必须由页面上下文发起：
 * 扩展页（popup）走 chrome.tts，content script 走页面的 Web Speech API。
 */
export function speak(text: string, lang = 'en-US'): SpeakResult {
  const trimmed = text.trim()
  if (!trimmed) {
    return { ok: false, message: '没有可朗读的内容。' }
  }

  if (chromeTtsAvailable()) {
    chrome.tts.speak(trimmed, { lang, rate: 0.9, enqueue: false })
    return { ok: true }
  }

  if (webSpeechAvailable()) {
    const utterance = new SpeechSynthesisUtterance(trimmed)
    utterance.lang = lang
    utterance.rate = 0.9
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
    return { ok: true }
  }

  return { ok: false, message: '当前环境不支持朗读。' }
}
