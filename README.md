# 英语单词学习插件

浏览网页时划词翻译，一键收藏生词。翻译使用 DeepSeek，数据默认保存在本地。

## 功能
- 选中英文单词 / 短语 / 句子，自动弹出翻译卡。
- 支持朗读原文（Popup 用 Chrome 内置 TTS，网页划词卡用系统 Web Speech）。
- 一键收藏，记录原文、翻译、上下文、来源网址和页面标题。
- 插件弹窗中检索、筛选、复习标记、删除生词。
- 间隔重复复习：按到期时间复习，「忘记 / 模糊 / 认识」三档自动排下次复习时间。
- 导出 CSV / JSON。
- 相同文本自动命中缓存，避免重复调用 DeepSeek；可在设置中一键清除缓存。

## 技术栈
- Chrome Extension Manifest V3
- TypeScript + Vite 8 + React 19
- CRXJS 3
- DeepSeek Chat Completions API

## 本地开发
```bash
npm install
npm run dev
```

`npm run dev` 生成 `dist/` 目录供 Chrome 加载。

生产构建与类型检查：
```bash
npm run typecheck
npm run build
```

## 加载插件
1. 打开 Chrome，访问 `chrome://extensions/`。
2. 开启右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择本项目 `dist/` 目录。
4. 点击工具栏里的插件图标，在「设置」中填写 DeepSeek API Key。

## DeepSeek 配置
- Base URL：`https://api.deepseek.com`
- 模型：`deepseek-chat`
- API Key 只保存在浏览器本地 `chrome.storage.local`，不会写入仓库或日志。

## 目录结构
```
src/
├─ background/        Service Worker：翻译、缓存、存储、消息路由
├─ content/           划词监听与页面悬浮卡
├─ popup/             生词本与设置界面
└─ shared/            类型、消息协议、工具函数
```
