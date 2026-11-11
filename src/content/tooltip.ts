import type { TranslateResult } from '../shared/types'
import type { LocalEntry } from '../shared/dictionary'

type TooltipAction = { label: string; primary?: boolean; onClick: () => void }

const CSS = `
:host {
  all: initial;
}
.tip {
  position: absolute;
  width: 320px;
  max-width: calc(100vw - 24px);
  padding: 12px;
  box-sizing: border-box;
  background: #ffffff;
  color: #1f2937;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.16);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 14px;
  line-height: 1.5;
}
.original {
  font-size: 17px;
  font-weight: 700;
  color: #111827;
}
.translation {
  margin-top: 6px;
  font-size: 15px;
  color: #2563eb;
  font-weight: 600;
}
.meta {
  margin-top: 6px;
  color: #6b7280;
  font-size: 13px;
}
.example {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f3f4f6;
  color: #4b5563;
  font-size: 13px;
}
.keywords {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f3f4f6;
  color: #4b5563;
  font-size: 13px;
}
.keyword {
  display: flex;
  gap: 6px;
  margin-top: 3px;
}
.keyword-word {
  font-weight: 600;
  color: #111827;
}
.badge {
  display: inline-block;
  margin-top: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #ecfdf5;
  color: #047857;
  font-size: 12px;
  font-weight: 600;
}
.badge.local {
  background: #eff6ff;
  color: #1d4ed8;
}
.error {
  color: #dc2626;
  font-size: 13px;
}
.notice {
  color: #065f46;
  font-size: 14px;
  font-weight: 600;
}
.loading {
  color: #6b7280;
  font-size: 13px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}
.button {
  border: 0;
  border-radius: 6px;
  padding: 5px 12px;
  cursor: pointer;
  font-size: 13px;
  background: #f3f4f6;
  color: #374151;
}
.button:hover {
  background: #e5e7eb;
}
.button.primary {
  background: #2563eb;
  color: #ffffff;
}
.button.primary:hover {
  background: #1d4ed8;
}
`

export class Tooltip {
  private host: HTMLDivElement
  private shadow: ShadowRoot
  private tip: HTMLDivElement
  private content: HTMLDivElement
  private actions: HTMLDivElement
  private hideTimer: number | undefined

  constructor() {
    this.host = document.createElement('div')
    this.host.id = 'vocab-catcher-tooltip-host'
    this.host.style.position = 'fixed'
    this.host.style.top = '0'
    this.host.style.left = '0'
    this.host.style.width = '0'
    this.host.style.height = '0'
    this.host.style.zIndex = '2147483647'

    this.shadow = this.host.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = CSS

    this.tip = document.createElement('div')
    this.tip.className = 'tip'
    this.tip.style.display = 'none'

    this.content = document.createElement('div')
    this.content.className = 'content'
    this.actions = document.createElement('div')
    this.actions.className = 'actions'

    this.tip.append(this.content, this.actions)
    this.shadow.append(style, this.tip)
    document.documentElement.appendChild(this.host)
  }

  isFromSelf(event: MouseEvent): boolean {
    return event.composedPath().includes(this.host)
  }

  showLoadingAt(rect: DOMRect): void {
    this.showAt(rect)
    this.clear()
    this.addText(this.content, '正在翻译…', 'loading')
    this.hideActions()
  }

  renderResult(
    result: TranslateResult,
    onSave: () => void,
    onSpeak: () => void,
    saved = false,
    onRemove?: () => void,
  ): void {
    this.clear()

    const original = this.addText(this.content, result.original, 'original')
    original.title = '原文'

    if (saved) {
      this.addText(this.content, '已收藏', 'badge')
    }

    this.addText(this.content, result.translation, 'translation')

    if (result.type === 'word' || result.phonetic || result.partOfSpeech) {
      const metaParts: string[] = []
      if (result.phonetic) metaParts.push(result.phonetic)
      if (result.partOfSpeech) metaParts.push(result.partOfSpeech)
      if (metaParts.length > 0) {
        this.addText(this.content, metaParts.join(' · '), 'meta')
      }
    }

    if (result.exampleOriginal) {
      const box = document.createElement('div')
      box.className = 'example'
      const source = document.createElement('div')
      source.textContent = result.exampleOriginal
      const target = document.createElement('div')
      target.textContent = result.exampleTranslation ?? ''
      box.append(source, target)
      this.content.appendChild(box)
    }

    if (Array.isArray(result.keyWords) && result.keyWords.length > 0) {
      const box = document.createElement('div')
      box.className = 'keywords'
      const title = document.createElement('div')
      title.textContent = '重点词汇'
      box.appendChild(title)
      for (const item of result.keyWords.slice(0, 6)) {
        const row = document.createElement('div')
        row.className = 'keyword'
        const word = document.createElement('span')
        word.className = 'keyword-word'
        word.textContent = item.word
        const meaning = document.createElement('span')
        meaning.textContent = item.meaning
        row.append(word, meaning)
        box.appendChild(row)
      }
      this.content.appendChild(box)
    }

    this.showActions([
      { label: '朗读', onClick: onSpeak },
      saved
        ? { label: '移出生词本', primary: true, onClick: onRemove ?? (() => this.hide()) }
        : { label: '收藏', primary: true, onClick: onSave },
      { label: '关闭', onClick: () => this.hide() },
    ])
  }

  renderLocal(
    displayWord: string,
    entry: LocalEntry,
    onSave: () => void,
    onSpeak: () => void,
    saved = false,
    onRemove?: () => void,
  ): void {
    this.clear()

    this.addText(this.content, displayWord, 'original')
    this.addText(this.content, '本地释义', 'badge local')

    if (saved) {
      this.addText(this.content, '已收藏', 'badge')
    }

    this.addText(this.content, entry.translation, 'translation')

    const metaParts: string[] = []
    if (entry.phonetic) metaParts.push(entry.phonetic)
    if (entry.pos) metaParts.push(entry.pos)
    if (metaParts.length > 0) {
      this.addText(this.content, metaParts.join(' · '), 'meta')
    }

    this.showActions([
      { label: '朗读', onClick: onSpeak },
      saved
        ? { label: '移出生词本', primary: true, onClick: onRemove ?? (() => this.hide()) }
        : { label: '收藏', primary: true, onClick: onSave },
      { label: '关闭', onClick: () => this.hide() },
    ])
  }

  renderError(message: string, actions?: TooltipAction[]): void {
    this.clear()
    this.addText(this.content, message, 'error')
    if (actions && actions.length > 0) {
      this.showActions(actions)
    } else {
      this.showActions([{ label: '关闭', onClick: () => this.hide() }])
    }
  }

  showNotice(message: string): void {
    this.clear()
    this.addText(this.content, message, 'notice')
    this.hideActions()
    this.scheduleHide(900)
  }

  hide(): void {
    this.tip.style.display = 'none'
    if (this.hideTimer !== undefined) {
      window.clearTimeout(this.hideTimer)
      this.hideTimer = undefined
    }
  }

  destroy(): void {
    this.hide()
    this.host.remove()
  }

  showAt(rect: DOMRect): void {
    const gap = 8
    const margin = 12
    const width = 320
    const estimatedHeight = 180
    const maxLeft = Math.max(margin, window.innerWidth - width - margin)
    const left = Math.max(margin, Math.min(rect.left, maxLeft))

    let top = rect.bottom + gap
    if (top + estimatedHeight > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - estimatedHeight - gap)
    }

    this.tip.style.left = `${left}px`
    this.tip.style.top = `${top}px`
    this.tip.style.display = 'block'
  }

  private clear(): void {
    this.content.replaceChildren()
    this.actions.replaceChildren()
  }

  private addText(parent: HTMLElement, text: string, className: string): HTMLDivElement {
    const element = document.createElement('div')
    element.className = className
    element.textContent = text
    parent.appendChild(element)
    return element
  }

  private showActions(items: TooltipAction[]): void {
    this.actions.replaceChildren()
    for (const item of items) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = item.label
      button.className = item.primary ? 'button primary' : 'button'
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        item.onClick()
      })
      this.actions.appendChild(button)
    }
  }

  private hideActions(): void {
    this.actions.replaceChildren()
  }

  private scheduleHide(delay: number): void {
    if (this.hideTimer !== undefined) {
      window.clearTimeout(this.hideTimer)
    }
    this.hideTimer = window.setTimeout(() => this.hide(), delay)
  }
}
