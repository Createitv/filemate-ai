# FileMate AI

跨平台 AI 智能文件管理器（Tauri 2 + React 18 + TypeScript + Tailwind CSS）。

> 本仓库为第一阶段 UI 脚手架，已对齐 `design/` 中的 4 张设计稿（首页、文件、自动化、预览）。
> 文件版本控制（PRD §2.6）暂未实现，等大文件策略确定后再加入。

## 功能要点

- ⚙️ Tauri 2.0 桌面应用（包体积小、原生性能）
- 🌐 多语言（i18n）：简体中文 / English，可在 *设置 → 语言* 切换
- 🎨 主题系统：浅色 / 深色 / 跟随系统 + 6 套主题色预设（蓝、紫、玫瑰、翠绿、琥珀、石墨）
- 🧠 AI 助手侧栏（UI 已就绪，等待后端接入 Ollama / Claude）
- 📂 文件浏览页（含原生风右键菜单）
- 🪄 自动化规则编辑器（If-Then UI）
- 👁 增强预览画廊（图片 / PDF / 视频 / 代码并排）

## 本地开发（macOS）

前置：Node 20+、Rust stable、Xcode CLT。

```sh
npm install
npm run tauri:dev          # 启动 Tauri 桌面壳 + Vite HMR
# 仅看前端：
npm run dev                # http://localhost:1420
```

## 生产构建

```sh
npm run tauri:build        # 输出到 src-tauri/target/release/bundle/
```

## Windows 打包（GitHub Actions）

仓库已包含 `.github/workflows/build-windows.yml`：

- **触发方式 1：手动**：仓库 → Actions → *Build Windows* → *Run workflow*
- **触发方式 2：打 tag**：`git tag v0.1.0 && git push --tags`，工作流会自动构建并把 MSI/NSIS 安装包附加到对应的 GitHub Release

产物：
- `*.msi`（Windows Installer）
- `*.exe`（NSIS 安装包）

## 目录结构

```
.
├── design/                        # 设计稿
├── src/                           # React 前端
│   ├── i18n/                      # zh-CN / en-US 语言包
│   ├── stores/theme.ts            # 主题色 + 模式（zustand + persist）
│   ├── components/
│   │   ├── ui/                    # Button / Card / Input
│   │   └── layout/                # Sidebar / TopBar / AIPanel / AppLayout
│   └── pages/                     # Home / Files / Automation / Preview / Settings
├── src-tauri/                     # Rust 后端
│   ├── src/{main.rs,lib.rs}
│   ├── tauri.conf.json
│   └── capabilities/default.json
└── .github/workflows/build-windows.yml
```

## 后续计划

- [ ] 文件版本控制（待与产品确认大文件策略）
- [ ] 接入 Tantivy 全文索引 + LanceDB 向量库
- [ ] 集成 Ollama 本地 AI 运行时
- [ ] 云存储 Provider（OneDrive / Google Drive / S3 / SMB）
- [ ] APFS 快照 / Windows VSS 系统级版本
