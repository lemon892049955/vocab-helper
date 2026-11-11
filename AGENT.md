# AGENT.md — 英语单词学习插件

Chrome MV3 划词翻译 + 生词本扩展。浏览网页选中英文 → 翻译卡片 → 一键收藏 → Popup 内按遗忘曲线复习 / 导出 Anki。定位「小而美」，差异化是**每条生词自动带语境句 + 来源**。

## 技术栈
- Manifest V3 + TypeScript + Vite 8 + CRXJS 3 + React 19
- 翻译：DeepSeek `chat/completions`（`response_format: json_object`）
- 存储：`chrome.storage.local`
- 离线兜底：ECDICT 清洗出的高频词典 `public/dict/en-zh-basic.json`（约 7000 词，frq≤8000）

## 目录结构
```
src/
  shared/        跨模块共用
    types.ts        数据模型（Note / AppSettings / 各 input）
    messages.ts     RuntimeMessage 消息协议 + ApiResponse<T> 封装
    speech.ts       朗读：按环境降级（popup 走 chrome.tts，content 走 window.speechSynthesis）
    dictionary.ts   ensureDictionary() 懒加载 + lookupLocal(word)
    utils.ts        normalizeText / classifyText / toCsvValue 等
  background/      service worker（扩展大脑）
    index.ts          消息路由（switch 分发）
    translate.ts      翻译 + 缓存
    lookup.ts         查词（先离线词典，未命中走 AI）
    cache.ts / notes.ts / settings.ts
    provider/         deepseek 实现 + 工厂（已就绪但未开放多 provider）
  content/        注入网页的划词脚本
    index.ts          mouseup 监听 → handleSelection
    tooltip.ts        原生 DOM + Shadow DOM 悬浮卡（非 React）
  popup/         点开插件图标的小窗（React）
    App.tsx / main.tsx / styles.css
public/
  dict/en-zh-basic.json   离线词典（源码资源，要提交）
  icons/icon{16,32,48,128}.png  扩展图标（源码资源，要提交）
manifest.config.ts   MV3 清单（icons / web_accessible_resources 已配）
```

## 架构约定（改代码前必读）
1. **朗读（TTS）**：`chrome.tts` 在 MV3 service worker 不可用。**统一走 `src/shared/speech.ts` 的 `speak()`**——popup 用 `chrome.tts`，content script 用 `window.speechSynthesis`。不要再往 background 加 TTS 逻辑。
2. **消息协议**：新增消息必须**同时**改两处——`src/shared/messages.ts` 的 `RuntimeMessage` 联合类型，和 `src/background/index.ts` 的 switch。漏改任一处会落到 default 返回 `BAD_REQUEST`。
3. **权限最小化**：能不加就不加。避免 `tabs` 权限（会触发"读取浏览记录"警告）。划词不做事前 tab 去重。
4. **悬浮卡在 Shadow DOM 里**：根元素 `id="vocab-catcher-tooltip-host"`，卡片 `.tip` 在其 `shadowRoot` 内部。主文档 `document.querySelector('.tip')` **查不到**，必须用 `host.shadowRoot.querySelector('.tip')`。测试/调试时这是最常见的坑。
5. **划词总开关**：`AppSettings.enabled`（默认 true）。content script 启动时读 `chrome.storage.local` 的 `settings` + 监听 `storage.onChanged` 实时生效，不走 background。

## 构建与测试
```bash
npm run dev        # 开发（CRXJS 热更）
npm run build      # 产出 dist/
npm run typecheck  # tsc --noEmit
```
**关键坑**：每次 `npm run build` 后 Vite 会清空 dist 并用新 hash 生成 chunk。Chrome 里**已加载的旧扩展**指向的 loader 文件已删除 → content script 404 → 划词完全无反应。**必须在 `chrome://extensions` 点刷新重新加载扩展**，并刷新测试网页（已打开的页面不会自动注入 content script）。

### 冒烟测试（Playwright 加载 unpacked 扩展）
```python
# /opt/anaconda3/bin/python3（已装 playwright 1.58，chromium 已下载）
from playwright.sync_api import sync_playwright
ctx = p.chromium.launch_persistent_context(
    user_data_dir="/tmp/vocab-ext-profile3", headless=False,
    args=["--disable-extensions-except=<dist>", "--load-extension=<dist>"])
# 轮询 ctx.service_workers 拿到 extension id；
# goto("chrome-extension://<id>/index.html") 即可像普通页测 popup
# content script 不注入 data:/file://，用 python3 -m http.server 起测试页
# 触发划词：createRange + sel.addRange + dispatchEvent(new MouseEvent('mouseup'))
```
注意：新 profile 首次加载扩展有时序问题（拿不到 service worker），用已配好的 `/tmp/vocab-ext-profile3` 或轮询重试。

## 当前功能状态
- ✅ 划词翻译（本地秒回 + AI 升级 + 无 Key/失败兜底）
- ✅ 生词本（收藏、按原文/翻译/标签搜索、删除、大小写去重）
- ✅ 复习（SM-2 遗忘曲线：认识 1→6→I×ease；模糊 ×1.2 保底不打回；忘记 10 分钟后重现）
- ✅ 查词 tab（popup 输入词 → 离线词典优先 → AI 兜底 → 收藏）
- ✅ 设置（已移至右上角齿轮图标，含 API Key/模型/Base URL/目标语言 + 测试/清除缓存）
- ✅ Anki 导出（Tab 分隔 txt + 头 `#separator:Tab`/`#html:true`）
- ✅ 朗读、已收藏回显（"移出生词本"）

## 仍未处理（非 bug，功能缺失）
1. 收藏 `tags` 始终为空；Popup 无标签筛选 / 编辑释义（需求 P1，用户明确暂不做编辑释义）。
2. manifest 仍无 `options_page`（设置走 popup 齿轮）。
3. 多 provider 切换：`AppSettings.provider` 硬编码 `'deepseek'`，工厂就绪未开放。

## Git 注意
- `.gitignore` 已排除 `.workbuddy/`、`dist/`、`node_modules/`、`*.zip`、测试产物。
- `public/dict/*.json` 与 `public/icons/*.png` 是**源码资源，必须提交**（不像 dist 能重生）。
- 本项目无敏感信息：DeepSeek Key 存在浏览器本地，不在仓库。
