import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ApiResponse, RuntimeMessage, TestConnectionResult } from '../shared/messages'
import type { AppSettings, Note, ReviewGrade, ReviewStatus, SaveSettingsInput, WordLookupResult } from '../shared/types'
import { speak } from '../shared/speech'
import { formatDate, toCsvValue } from '../shared/utils'

type Tab = 'notes' | 'review' | 'settings' | 'lookup'
type NoteFilter = 'all' | Note['type']
type ReviewFilter = 'all' | ReviewStatus

const typeLabels: Record<Note['type'], string> = {
  word: '单词',
  phrase: '短语',
  sentence: '句子',
}

const reviewOptions: { value: ReviewStatus; label: string; className: string }[] = [
  { value: 'new', label: '新词', className: 'new' },
  { value: 'learning', label: '模糊', className: 'learning' },
  { value: 'known', label: '认识', className: 'known' },
]

const gradeOptions: { value: ReviewGrade; label: string; className: string }[] = [
  { value: 'forgot', label: '忘记', className: 'forgot' },
  { value: 'fuzzy', label: '模糊', className: 'fuzzy' },
  { value: 'known', label: '认识', className: 'known' },
]

function sendMessage<T>(message: RuntimeMessage): Promise<ApiResponse<T> | undefined> {
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

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Anki 用 Tab 分列，字段内部不能出现制表符或换行 */
function toAnkiField(text: string): string {
  return text.replace(/[\t\r\n]+/g, ' ').trim()
}

function buildAnkiBack(note: Note): string {
  const parts: string[] = [`<b>${escapeHtml(note.translation)}</b>`]

  const meta = [note.phonetic, note.partOfSpeech].filter(Boolean).join(' · ')
  if (meta) parts.push(`<i>${escapeHtml(meta)}</i>`)

  if (note.exampleOriginal) {
    const example = escapeHtml(note.exampleOriginal)
    const translated = note.exampleTranslation ? `<br>${escapeHtml(note.exampleTranslation)}` : ''
    parts.push(`${example}${translated}`)
  }

  if (note.contextSentence) {
    parts.push(`<span style="color:#6b7280">${escapeHtml(note.contextSentence)}</span>`)
  }

  const source = note.sourceTitle || note.sourceUrl
  if (source) {
    parts.push(`<span style="color:#9ca3af">${escapeHtml(source)}</span>`)
  }

  return parts.join('<br>')
}

function notesToAnki(notes: Note[]): string {
  const header = ['#separator:Tab', '#html:true', 'Front\tBack']
  const rows = notes.map((note) =>
    [toAnkiField(note.original), toAnkiField(buildAnkiBack(note))].join('\t'),
  )
  return `${[...header, ...rows].join('\n')}\n`
}

function notesToCsv(notes: Note[]): string {
  const header = [
    '类型',
    '原文',
    '翻译',
    '音标',
    '词性',
    '英文例句',
    '例句翻译',
    '上下文',
    '标签',
    '来源标题',
    '来源网址',
    '复习状态',
    '模型',
    '创建时间',
  ]
  const rows = notes.map((note) =>
    [
      typeLabels[note.type],
      note.original,
      note.translation,
      note.phonetic ?? '',
      note.partOfSpeech ?? '',
      note.exampleOriginal ?? '',
      note.exampleTranslation ?? '',
      note.contextSentence ?? '',
      note.tags.join(';'),
      note.sourceTitle ?? '',
      note.sourceUrl ?? '',
      note.reviewStatus,
      note.model,
      formatDate(note.createdAt),
    ]
      .map(toCsvValue)
      .join(','),
  )
  return `\uFEFF${[header.map(toCsvValue).join(','), ...rows].join('\n')}`
}

export default function App() {
  const [tab, setTab] = useState<Tab>('notes')
  const [notes, setNotes] = useState<Note[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [noteFilter, setNoteFilter] = useState<NoteFilter>('all')
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all')
  const [lookupInput, setLookupInput] = useState('')
  const [lookupResult, setLookupResult] = useState<WordLookupResult | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupSaved, setLookupSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

  const [dueNotes, setDueNotes] = useState<Note[]>([])
  const [revealed, setRevealed] = useState(false)
  const [dueLoading, setDueLoading] = useState(false)

  const [form, setForm] = useState({
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com',
    targetLanguage: '简体中文',
    apiKey: '',
  })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState('')

  const loadSettings = useCallback(async () => {
    const response = await sendMessage<AppSettings>({ type: 'getSettings' })
    if (response?.ok) {
      setSettings(response.data)
      setForm((current) => ({
        ...current,
        model: response.data.model,
        baseUrl: response.data.baseUrl,
        targetLanguage: response.data.targetLanguage,
      }))
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300)
    return () => window.clearTimeout(timer)
  }, [query])

  const loadNotes = useCallback(async () => {
    const response = await sendMessage<Note[]>({
      type: 'listNotes',
      payload: { query: debouncedQuery, noteType: noteFilter, reviewStatus: reviewFilter },
    })
    if (response?.ok) {
      setNotes(response.data)
    }
    setLoading(false)
  }, [debouncedQuery, noteFilter, reviewFilter])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => {
    void loadNotes()
  }, [loadNotes])

  const loadDueNotes = useCallback(async () => {
    setDueLoading(true)
    const response = await sendMessage<Note[]>({ type: 'getDueNotes', payload: { limit: 50 } })
    if (response?.ok) {
      setDueNotes(response.data)
      setRevealed(false)
    }
    setDueLoading(false)
  }, [])

  useEffect(() => {
    if (tab === 'review') {
      void loadDueNotes()
    }
  }, [tab, loadDueNotes])

  const currentDueNote = useMemo(() => (dueNotes.length > 0 ? dueNotes[0] : null), [dueNotes])

  const showNotice = (text: string) => {
    setNotice(text)
    window.setTimeout(() => setNotice(''), 2000)
  }

  const handleGrade = async (grade: ReviewGrade) => {
    const note = currentDueNote
    if (!note) return

    const response = await sendMessage<Note>({ type: 'reviewNote', payload: { id: note.id, grade } })
    if (!response?.ok) {
      showNotice(response?.error?.message ?? '复习失败')
      return
    }

    if (grade === 'forgot') {
      setDueNotes((current) => (current.length > 1 ? [...current.slice(1), current[0]] : []))
      setRevealed(false)
      showNotice('10 分钟后再练一次')
      return
    }

    setDueNotes((current) => current.slice(1))
    setRevealed(false)
    showNotice(`${response.data.intervalDays} 天后再见`)
  }

  const handleUpdateReview = async (id: string, reviewStatus: ReviewStatus) => {
    const response = await sendMessage<Note>({ type: 'updateReview', payload: { id, reviewStatus } })
    if (response?.ok) {
      await loadNotes()
    } else {
      showNotice(response?.error?.message ?? '更新失败')
    }
  }

  const handleDelete = async (id: string) => {
    const response = await sendMessage<{ deleted: boolean }>({
      type: 'deleteNote',
      payload: { id },
    })
    if (response?.ok) {
      await loadNotes()
    } else {
      showNotice(response?.error?.message ?? '删除失败')
    }
  }

  const handleSpeak = (text: string) => {
    const result = speak(text, 'en-US')
    if (!result.ok) {
      showNotice(result.message)
    }
  }

  const handleLookup = async () => {
    const word = lookupInput.trim()
    if (!word) return
    setLookupLoading(true)
    setLookupSaved(false)
    const response = await sendMessage<WordLookupResult>({ type: 'lookupWord', payload: { word } })
    if (response?.ok) {
      setLookupResult(response.data)
    } else {
      setLookupResult(null)
      showNotice(response?.error?.message ?? '查询失败')
    }
    setLookupLoading(false)
  }

  const handleLookupSave = async () => {
    if (!lookupResult || !lookupResult.found) return
    const result = lookupResult
    const response = await sendMessage<{ id: string; updated: boolean }>({
      type: 'saveNote',
      payload: {
        type: 'word',
        original: result.original,
        translation: result.translation ?? '',
        phonetic: result.phonetic,
        partOfSpeech: result.partOfSpeech,
        exampleOriginal: result.exampleOriginal,
        exampleTranslation: result.exampleTranslation,
        targetLanguage: settings?.targetLanguage ?? '简体中文',
        model: result.source === 'local' ? 'local' : (result.model ?? 'deepseek-chat'),
      },
    })
    if (response?.ok) {
      setLookupSaved(true)
      showNotice(response.data.updated ? '已更新收藏' : '已收藏到生词本')
    } else {
      showNotice(response?.error?.message ?? '收藏失败')
    }
  }

  const handleLookupSpeak = () => {
    if (!lookupResult) return
    const result = speak(lookupResult.original, 'en-US')
    if (!result.ok) showNotice(result.message)
  }

  const handleClearCache = async () => {
    const response = await sendMessage<{ cleared: boolean }>({ type: 'clearCache' })
    if (response?.ok) {
      showNotice('翻译缓存已清除')
    } else {
      showNotice(response?.error?.message ?? '清除失败')
    }
  }

  const handleExport = async (format: 'csv' | 'json' | 'anki') => {
    const response = await sendMessage<Note[]>({
      type: 'listNotes',
      payload: { query: debouncedQuery, noteType: noteFilter, reviewStatus: reviewFilter },
    })
    if (!response?.ok) {
      showNotice(response?.error?.message ?? '导出失败')
      return
    }

    const date = new Date()
    const stamp = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('')

    if (format === 'csv') {
      download(`vocabulary_${stamp}.csv`, notesToCsv(response.data), 'text/csv;charset=utf-8')
    } else if (format === 'anki') {
      download(`vocabulary_anki_${stamp}.txt`, notesToAnki(response.data), 'text/plain;charset=utf-8')
    } else {
      download(`vocabulary_${stamp}.json`, JSON.stringify(response.data, null, 2), 'application/json')
    }
    showNotice('已开始导出')
  }

  const handleSaveSettings = async (event: FormEvent) => {
    event.preventDefault()
    const payload: SaveSettingsInput = {
      model: form.model.trim(),
      baseUrl: form.baseUrl.trim(),
      targetLanguage: form.targetLanguage.trim(),
    }
    if (form.apiKey.trim()) {
      payload.apiKey = form.apiKey.trim()
    }

    const response = await sendMessage<AppSettings>({ type: 'saveSettings', payload })
    if (response?.ok) {
      setSettings(response.data)
      setForm((current) => ({ ...current, apiKey: '' }))
      showNotice('设置已保存')
    } else {
      showNotice(response?.error?.message ?? '保存失败')
    }
  }

  const handleClearKey = async () => {
    const response = await sendMessage<AppSettings>({
      type: 'saveSettings',
      payload: { apiKey: null },
    })
    if (response?.ok) {
      setSettings(response.data)
      showNotice('API Key 已清除')
    }
  }

  const handleToggleEnabled = async () => {
    const next = !(settings?.enabled ?? true)
    const response = await sendMessage<AppSettings>({
      type: 'saveSettings',
      payload: { enabled: next },
    })
    if (response?.ok) {
      setSettings(response.data)
      showNotice(next ? '划词翻译已开启' : '划词翻译已关闭')
    } else {
      showNotice(response?.error?.message ?? '操作失败')
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult('')
    const response = await sendMessage<TestConnectionResult>({ type: 'testConnection' })
    setTesting(false)
    if (response?.ok) {
      setTestResult(response.data.message)
    } else {
      setTestResult(response?.error?.message ?? '连接失败')
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand-row">
          <div className="brand">英语单词学习插件</div>
          <div className="header-actions">
            <button
              type="button"
              className={settings?.enabled === false ? 'switch off' : 'switch'}
              onClick={() => void handleToggleEnabled()}
              title={settings?.enabled === false ? '划词翻译已关闭，点击开启' : '划词翻译已开启，点击关闭'}
            >
              <span className="switch-track">
                <span className="switch-thumb" />
              </span>
              <span className="switch-label">{settings?.enabled === false ? '已关闭' : '已开启'}</span>
            </button>
            <button
              type="button"
              className={tab === 'settings' ? 'gear active' : 'gear'}
              onClick={() => setTab('settings')}
              title="设置"
              aria-label="设置"
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>
        <div className="tabs">
          <button className={tab === 'notes' ? 'tab active' : 'tab'} onClick={() => setTab('notes')}>
            生词本
          </button>
          <button
            className={tab === 'review' ? 'tab active' : 'tab'}
            onClick={() => setTab('review')}
          >
            复习
          </button>
          <button
            className={tab === 'lookup' ? 'tab active' : 'tab'}
            onClick={() => setTab('lookup')}
          >
            查词
          </button>
        </div>
      </header>

      {notice && <div className="toast">{notice}</div>}

      {tab === 'notes' && (
        <main className="body">
          <div className="toolbar">
            <input
              className="search"
              type="search"
              placeholder="搜索原文 / 翻译 / 标签"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="filters">
              <select value={noteFilter} onChange={(event) => setNoteFilter(event.target.value as NoteFilter)}>
                <option value="all">全部类型</option>
                <option value="word">单词</option>
                <option value="phrase">短语</option>
                <option value="sentence">句子</option>
              </select>
              <select
                value={reviewFilter}
                onChange={(event) => setReviewFilter(event.target.value as ReviewFilter)}
              >
                <option value="all">全部状态</option>
                <option value="new">新词</option>
                <option value="learning">模糊</option>
                <option value="known">认识</option>
              </select>
            </div>
            <div className="export-row">
              <button className="subtle" onClick={() => void handleExport('anki')}>
                导出 Anki
              </button>
              <button className="subtle" onClick={() => void handleExport('csv')}>
                导出 CSV
              </button>
              <button className="subtle" onClick={() => void handleExport('json')}>
                导出 JSON
              </button>
            </div>
          </div>

          {loading ? (
            <div className="empty">加载中…</div>
          ) : notes.length === 0 ? (
            <div className="empty">
              还没有收藏内容。在网页上选中英文，点击弹出的「收藏」即可。
            </div>
          ) : (
            <ul className="note-list">
              {notes.map((note) => (
                <li key={note.id} className="note">
                  <div className="note-top">
                    <span className={`type type-${note.type}`}>{typeLabels[note.type]}</span>
                    <button className="speak" onClick={() => handleSpeak(note.original)}>
                      朗读
                    </button>
                    <span className="date">{formatDate(note.createdAt)}</span>
                    <button className="delete" onClick={() => void handleDelete(note.id)}>
                      删除
                    </button>
                  </div>
                  <div className="note-original">{note.original}</div>
                  <div className="note-translation">{note.translation}</div>
                  {(note.phonetic || note.partOfSpeech) && (
                    <div className="note-meta">
                      {[note.phonetic, note.partOfSpeech].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {note.exampleOriginal && (
                    <div className="note-example">
                      {note.exampleOriginal}
                      {note.exampleTranslation ? ` — ${note.exampleTranslation}` : ''}
                    </div>
                  )}
                  {note.sourceUrl && (
                    <a className="source" href={note.sourceUrl} target="_blank" rel="noreferrer">
                      {note.sourceTitle || note.sourceUrl}
                    </a>
                  )}
                  <div className="review-row">
                    {reviewOptions.map((option) => (
                      <button
                        key={option.value}
                        className={`review ${option.className} ${note.reviewStatus === option.value ? 'active' : ''}`}
                        onClick={() => void handleUpdateReview(note.id, option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </main>
      )}

      {tab === 'review' && (
        <main className="body review-body">
          {dueLoading ? (
            <div className="empty">加载中…</div>
          ) : !currentDueNote ? (
            <div className="empty">
              暂时没有到期需要复习的内容。
              <br />
              收藏生词后，它们会按复习间隔出现在这里。
            </div>
          ) : (
            <>
              <div className="due-count">待复习 {dueNotes.length} 条</div>
              <div className="review-card">
                <div className="note-top">
                  <span className={`type type-${currentDueNote.type}`}>
                    {typeLabels[currentDueNote.type]}
                  </span>
                  <button className="speak" onClick={() => handleSpeak(currentDueNote.original)}>
                    朗读
                  </button>
                  <span className="date">复习 {currentDueNote.reviewCount} 次</span>
                </div>
                <div className="note-original">{currentDueNote.original}</div>

                {revealed ? (
                  <div className="answer">
                    <div className="note-translation">{currentDueNote.translation}</div>
                    {(currentDueNote.phonetic || currentDueNote.partOfSpeech) && (
                      <div className="note-meta">
                        {[currentDueNote.phonetic, currentDueNote.partOfSpeech]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    )}
                    {currentDueNote.exampleOriginal && (
                      <div className="note-example">
                        {currentDueNote.exampleOriginal}
                        {currentDueNote.exampleTranslation
                          ? ` — ${currentDueNote.exampleTranslation}`
                          : ''}
                      </div>
                    )}
                  </div>
                ) : (
                  <button className="subtle reveal" onClick={() => setRevealed(true)}>
                    显示答案
                  </button>
                )}
              </div>

              {revealed ? (
                <div className="grade-row">
                  {gradeOptions.map((option) => (
                    <button
                      key={option.value}
                      className={`grade ${option.className}`}
                      onClick={() => void handleGrade(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="reveal-hint">先看看答案，再评分</div>
              )}
              <button className="skip" onClick={() => setDueNotes((current) => current.slice(1))}>
                跳过这条
              </button>
            </>
          )}
        </main>
      )}

      {tab === 'settings' && (
        <main className="body settings">
          <form onSubmit={handleSaveSettings}>
            {!settings?.apiKeyConfigured && (
              <div className="hint">使用前需要先填写 DeepSeek API Key。</div>
            )}
            <label className="field">
              <span>API Key</span>
              <input
                type="password"
                placeholder={settings?.apiKeyConfigured ? '已配置，留空则保持不变' : 'sk-...'}
                value={form.apiKey}
                onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>模型</span>
              <input
                type="text"
                value={form.model}
                onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>Base URL</span>
              <input
                type="text"
                value={form.baseUrl}
                onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>目标语言</span>
              <input
                type="text"
                value={form.targetLanguage}
                onChange={(event) =>
                  setForm((current) => ({ ...current, targetLanguage: event.target.value }))
                }
              />
            </label>
            <div className="settings-actions">
              <button className="primary" type="submit">
                保存设置
              </button>
              <button className="subtle" type="button" onClick={() => void handleTest()} disabled={testing}>
                {testing ? '测试中…' : '测试连接'}
              </button>
              {settings?.apiKeyConfigured && (
                <button className="subtle" type="button" onClick={() => void handleClearKey()}>
                  清除 Key
                </button>
              )}
              <button className="subtle" type="button" onClick={() => void handleClearCache()}>
                清除翻译缓存
              </button>
            </div>
          </form>
          {testResult && <div className="test-result">{testResult}</div>}
        </main>
      )}

      {tab === 'lookup' && (
        <main className="body lookup-body">
          <div className="lookup-bar">
            <input
              className="search"
              type="text"
              placeholder="输入英文单词查询，如 apple"
              value={lookupInput}
              onChange={(event) => {
                setLookupInput(event.target.value)
                setLookupSaved(false)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleLookup()
              }}
            />
            <button className="primary" onClick={() => void handleLookup()} disabled={lookupLoading}>
              {lookupLoading ? '查询中…' : '查询'}
            </button>
          </div>

          {lookupLoading ? (
            <div className="empty">查询中…</div>
          ) : !lookupResult ? (
            <div className="empty">输入单词即可查询释义，支持离线词典与联网翻译。</div>
          ) : !lookupResult.found ? (
            <div className="empty">{lookupResult.message ?? '未找到该词的释义。'}</div>
          ) : (
            <div className="lookup-card">
              <div className="note-top">
                <span className="type type-word">单词</span>
                {lookupResult.source === 'local' && <span className="lookup-badge">离线词典</span>}
                <button className="speak" onClick={handleLookupSpeak}>
                  朗读
                </button>
              </div>
              <div className="note-original">{lookupResult.original}</div>
              {(lookupResult.phonetic || lookupResult.partOfSpeech) && (
                <div className="note-meta">
                  {[lookupResult.phonetic, lookupResult.partOfSpeech].filter(Boolean).join(' · ')}
                </div>
              )}
              <div className="note-translation">{lookupResult.translation}</div>
              {lookupResult.exampleOriginal && (
                <div className="note-example">
                  {lookupResult.exampleOriginal}
                  {lookupResult.exampleTranslation ? ` — ${lookupResult.exampleTranslation}` : ''}
                </div>
              )}
              <button
                className="primary lookup-save"
                onClick={() => void handleLookupSave()}
                disabled={lookupSaved}
              >
                {lookupSaved ? '已收藏' : '收藏到生词本'}
              </button>
            </div>
          )}
        </main>
      )}
    </div>
  )
}
