import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: '英语单词学习插件',
  version: '0.1.0',
  description: '划词翻译并收藏生词，使用 DeepSeek 作为翻译引擎。',
  permissions: ['storage', 'tts'],
  host_permissions: ['https://api.deepseek.com/*'],
  icons: {
    '16': 'icons/icon16.png',
    '32': 'icons/icon32.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png',
  },
  action: {
    default_title: '英语单词学习插件',
    default_popup: 'index.html',
    default_icon: {
      '16': 'icons/icon16.png',
      '32': 'icons/icon32.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png',
    },
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  web_accessible_resources: [
    {
      resources: ['dict/*'],
      matches: ['<all_urls>'],
    },
  ],
})
