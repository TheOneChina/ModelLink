# ModelLink 重构施工文档：迁移到 Tauri v2 + React（对齐 ClaudeCN 技术栈）

> 状态：计划已定稿（2026-07-13），待执行。
> 参考项目：`/Users/huangyonghao/Documents/项目/ClaudeCN/gui-tauri`（技术栈与组件库的对齐目标，工程基建的复用来源）。
> 现有实现：`claude-model-proxy/`（纯 Rust：axum + wry/tao + tray-icon，单文件 `main.rs` ~1200 行 + `ui.html` ~860 行）。

## 1. 目标与范围

把 ModelLink 从手搓 wry/tao 单文件应用重写为 **Tauri v2 + React 19 + TypeScript + Vite 6 + Tailwind 4**，组件体系与工程规范全面对齐 ClaudeCN gui-tauri。同时：

- **加入完整自动更新**（复用 ClaudeCN 的 tauri-plugin-updater + minisign + latest.json 模式，新建 ModelLink 专用密钥）
- **UI 彻底重新设计**（连布局一起重做，设计稿先行，见 §6）
- 代理核心逻辑（axum 转发、网关配置写入）**原样平移，不重写**
- 版本号 1.0.0 → **2.0.0**

已拍板的决策：自动更新=完整自更新；视觉=彻底重新设计；仓库=GitHub 已有仓库（本地需 git init 并关联远程，发版走该仓库 Releases）。

## 2. 技术栈（版本对齐 ClaudeCN 的 package.json / Cargo.toml）

- 前端：React 19.1、Vite 6、TypeScript 5.6、Tailwind CSS 4（`@tailwindcss/vite`）、`@tanstack/react-query` 5、`framer-motion` 11、`lucide-react`、`class-variance-authority` + `clsx` + `tailwind-merge`
- 组件库：**正式使用 shadcn/ui**（2026-07-13 用户指定，注意这点与 ClaudeCN 不同——ClaudeCN 只有 shadcn 约定 + 自写 CSS 类，ModelLink 走标准 shadcn 路线）。`components.json` 用 new-york 风格 + CSS variables 主题；按需安装：Button / Card / Input / Label / Switch / Select / Dialog / AlertDialog / Tabs / Badge / Accordion / ScrollArea / Sonner(toast) / Tooltip / Progress / Skeleton / Separator。主题变量映射 ModelLink 品牌色 `#D97757`（palette 详见 design.md），深色用 `.dark` class + localStorage 三态切换
- Rust：`tauri = 2` + 插件 `updater` / `process` / `opener` / `autostart`；业务依赖 `axum` / `tokio` / `reqwest(stream)` / `serde` / `serde_json`
- release profile 抄 ClaudeCN：`opt-level="s"` + `lto="thin"` + `codegen-units=1` + `strip="symbols"`

## 3. 兼容红线（老用户无感升级，逐条验收）

1. **代理端口 5678 不变**——老用户 Claude Desktop 配置写死 `http://127.0.0.1:5678`。
   > 2026-07-14 用户拍板补充：**默认值恒为 5678**（红线对默认值成立，config.json 仅在非默认时写 `port` 字段），但用户可在设置页热切换端口——ModelLink 同时改写 Claude 网关 URL，重新应用后 Claude 跟随。端口被占时不再退出：弹提示 + 侧栏「代理未运行」，可进设置页换端口自救。
2. **配置文件 `~/.claude-model-proxy/config.json` 路径与 serde 格式不变**——`providers[] { target_url, api_key, models[] { name, to_1m }, thinking_effort }`，原子写入（tmp+rename）、unix 0600。
3. **Claude-3p 网关写入逻辑逐字节等价**——`configLibrary/` 的固定 UUID `a0a0a0a0-b1b1-4c2c-9d3d-e4e4e4e4e4e4`、`_meta.json` 合并规则、`claude_desktop_config.json` 的 `deploymentMode: "3p"`、Windows 的 MSIX/LOCALAPPDATA/APPDATA 多路径 fallback 与 developer_settings/config.json 写入，全部照搬 `main.rs:230-640`。
   > 2026-07-14 用户拍板的唯一例外：apply 写入的 `inferenceModels` 条目在 `{name, supports1m}` 基础上新增 `labelOverride`=厂商模型名（新版 Claude 模型选择器显示真实模型名；官方语义 display-only，`name` 仍是请求所发 ID，槽位路由机制不变；老版 Claude 忽略未知字段）。其余写入仍逐字节等价，回归脚本按「剔除 labelOverride 后一致」校验。
4. **代理行为等价**——8 个 `ANTHROPIC_SLOTS` 槽位映射、`[1m]` 后缀变体、`thinking_effort` 注入（`""`=不干预 / `off`=disabled / `high`/`max`=enabled+output_config）、`anthropic-beta` / `x-api-key` / `user-agent` 头透传、`/v1/models` 列表格式、流式转发、10MB body 上限、无匹配时 fallback 第一个模型。
5. **老 LaunchAgent 迁移**——新版首启检测 `~/Library/LaunchAgents/com.modellink.plist`（指向旧 .app），存在则删除并用 `tauri-plugin-autostart` 重新注册（保持"自启已开启"状态不丢）。

## 4. 功能清单（迁移不能漏）

代理服务（127.0.0.1:5678，常驻）；服务商 CRUD + 8 个内置预设（DeepSeek / Kimi Code / Kimi 开放平台 / MiniMax / 百炼 Coding / 百炼 Token / GLM / mimo，预设数据在 `ui.html:284-333`）；模型上限 8 个（跨服务商累计）+ 槽位名提示 + datalist 建议 + 1M 开关；推理强度四态（按服务商预设约束可选项）；连接测试（1 token 试探请求 + 错误话术）；应用到 Claude Desktop（校验 → 写网关 → 自动重启 Claude，macOS osascript / Windows powershell 含 MSIX 分支）；请求日志（内存 100 条：时间/模型/状态/thinking 标签）；开机自启；主题三态（亮/暗/跟随系统，localStorage）；托盘常驻（关窗隐藏、左键唤起、菜单：显示窗口/退出）+ macOS Accessory（无 Dock 图标）+ Edit 菜单（剪贴板快捷键）；防篡改水印系统（底部水印条 + 头部徽章 + MutationObserver 护栏 + 原型劫持，`ui.html:718-858`，移植为 React hook + 组件，保护强度不降）；端口占用友好报错。

**Windows 自启修复**：现版手写 plist 在 Windows 上无效（用了 HOME 路径），tauri-plugin-autostart 直接修复——这是重构红利，验收时确认 Windows 注册表项生效。

## 5. 架构设计

```
gui-tauri/                        # 新目录，与 claude-model-proxy/ 平行
├── package.json / vite.config.ts / tsconfig.json   # 对照 ClaudeCN 抄
├── src/                          # React 前端
│   ├── main.tsx / App.tsx / index.css
│   ├── components/               # 按定稿设计拆分
│   └── lib/ipc.ts / queryClient.ts / useUpdater.ts / useWatermark.ts
└── src-tauri/
    ├── src/main.rs               # 入口，仅调 lib::run()
    ├── src/lib.rs                # builder + 命令注册 + AppState + 托盘 + setup 起代理
    ├── src/proxy.rs              # axum：/v1/models + fallback 转发（平移 main.rs:642-1025）
    ├── src/gateway.rs            # Claude-3p 写入 + 重启 Claude（平移 main.rs:230-640, 833-882）
    ├── src/config.rs             # 配置读写（平移 main.rs:78-145）
    ├── tauri.conf.json / capabilities/ / icons/
    └── scripts/                  # 从 ClaudeCN 拷改：build-mac.sh / gen-latest-json.sh / release-mac.sh
```

- **axum 与 Tauri 共存**：setup 钩子里 `tauri::async_runtime::spawn` 启动 axum 绑定 5678。axum 只保留代理职责（`/v1/models` + fallback），不再 serve UI/API。端口被占时弹原生错误对话框并退出（保留现有话术"请先关闭另一个实例"）。
- **IPC 契约**（对照 ClaudeCN 的 `ipc.ts` 类型化封装）：
  - `get_config() -> Config`
  - `save_config(config: Config) -> Result<(), String>`
  - `test_provider(target_url, api_key, model) -> { ok: bool, message: String }`
  - `apply_to_claude() -> Result<String, String>`（校验 → 保存 → 写网关 → 重启 Claude）
  - `get_logs() -> Vec<LogEntry>`
  - `gui_version() -> String`
  - 自启读写走 autostart 插件 API；打开外链走 opener（capabilities 白名单仅 github.com 与各服务商官网）
- **AppState**：`RwLock<Config>` + `RwLock<Vec<LogEntry>>` + reqwest Client（connect 30s / total 300s），与现实现同构。
- **托盘**：Tauri v2 `TrayIcon` + 菜单；`WindowEvent::CloseRequested` 拦截改 hide；macOS `set_activation_policy(Accessory)`。用真 logo 替换现在代码画的圆点图标（`tauri icon` 从现有 logo 生成全套）。
- **前端数据层**：TanStack Query——`config` / `logs` 两个 query + `save` / `apply` / `test` 三个 mutation；`staleTime: Infinity`，mutation 后手动 invalidate（对齐 ClaudeCN queryClient.ts）。

## 6. UI 设计（已定稿，以 docs/design.md 为准）

2026-07-13 用户选定方案 **v2「侧栏导航 + 模型链路板」**，完整设计规格已冻结为 **`docs/design.md`**（窗口与骨架、色板令牌、字号表、四个页面逐一规格、应用状态机、水印护栏、shadcn 组件映射、动效、关键文案表）。**前端实现以 design.md 为准，不要自行发挥设计**；像素细节参照 `docs/design-proposal.html`（v2 高保真 mockup）。`docs/design-proposal-v3.html` 为落选方案存档，勿参考。

一句话概括：横向窗口 880×640，左侧 178px 导航（概览 / 服务商 / 请求日志 / 设置），概览页主视觉为「模型链路板」（Claude 槽位 → 真实模型映射可视化），服务商页双栏编辑器，自动保存 + 应用状态机（clean/dirty/applying/error，hash 判定，三处同源 dirty 提示），空状态即预设网格引导，水印移侧栏底部（防篡改护栏不变）。

## 7. 自动更新与发版

- 新建 ModelLink 专用 minisign 密钥（建议 `~/.modellink-updater/modellink.key`），**私钥丢失 = 已装用户永远收不到更新**，保管要求写进 README（学 ClaudeCN SIGNING.md）。
- `tauri.conf.json`：`createUpdaterArtifacts: true`，endpoint 指向 ModelLink 仓库的 `releases/latest/download/latest.json`。
- 前端复用 ClaudeCN 的 `useUpdater.ts` + `UpdateModal`（含下载进度、macOS relaunch 兜底 `force_quit_and_relaunch` 命令）+「跳过此版本 / 24h 冷却」localStorage 克制策略。
- 脚本从 ClaudeCN `scripts/` 拷改：`build-mac.sh`（Developer ID 签名 + 公证 + DMG 补公证，凭据走 `signing.local.env`，可与 ClaudeCN 共用同一套 Apple 凭据）、`gen-latest-json.sh`（darwin-aarch64）、`release-mac.sh`（gh release）。Windows 交 GitHub Actions（拷 ClaudeCN 的 `build-windows.yml` 改造）。
- DMG 复用现有 `dmg-background.png`。
- 预期说明：v1 无 updater，v1→v2 靠官网/抖音通知；v2 起进入自动更新通道。

## 8. 分阶段任务

| 阶段 | 内容 | 完成标志 |
|---|---|---|
| P-1 设计 | **已完成**（2026-07-13 用户选定 v2，规格已冻结为 docs/design.md） | ✅ design.md 已冻结 |
| P0 基建 | git init + 关联 GitHub 远程；脚手架 `gui-tauri/`（依赖版本对照 ClaudeCN）；`tauri icon` 生成图标；空壳窗口 + 托盘 + Accessory + 关窗隐藏跑通 | 双平台空壳可运行 |
| P1 Rust 平移 | proxy.rs / gateway.rs / config.rs 平移；给 `resolve_model` / `flatten_config` / thinking 注入补单元测试（现无测试） | `cargo test` 绿；curl 5678 代理转发成功 |
| P2 命令层 | 6 个 command + autostart（含旧 plist 迁移）+ 端口占用报错 | 前端可调通全部命令 |
| P3 前端 | shadcn init + 安装 §2 组件清单；按 design.md 实现组件树 + 数据层 + 水印移植 + 主题三态 | 全功能可用 |
| P4 更新 | updater 插件 + useUpdater + UpdateModal + 新密钥 | 见 P6 更新验收项 |
| P5 打包 | tauri.conf 完整化；scripts 三件套 + Windows CI | 双平台出包（dmg + exe/nsis） |
| P6 验收 | 下方验收清单逐项过 | 全绿后发 2.0.0 |

## 9. 验收清单

- [ ] 用本机现有 `~/.claude-model-proxy/config.json` 直接启动，服务商列表无损显示
- [ ] Claude Desktop 经 5678 真机对话成功；请求日志出现记录
- [ ] `/v1/models` 响应与旧版 diff 一致；`[1m]` 变体、thinking 三态注入抓包对比一致
- [ ] 「应用到 Claude Desktop」后 Claude 自动重启并接入（macOS + Windows，Windows 含 MSIX 版）
- [ ] 老 `com.modellink.plist` 被迁移；自启双平台生效（Windows 为修复项，重点验证）
- [ ] 托盘：关窗隐藏 / 左键唤起 / 菜单退出；macOS 无 Dock 图标；Edit 快捷键可用
- [ ] 自更新端到端：装 2.0.0-beta → 发测试 release → 检查/下载/验签/安装/重启全链路成功
- [ ] 水印条/徽章存在且防篡改行为保留（DevTools 删除后自动恢复）
- [ ] 新旧同装时端口冲突有友好提示
- [ ] 记录体积与启动耗时对比（预期 .app ~10MB，接受）

## 10. 风险与对策

- **minisign 私钥保管**（最高风险）：备份到密码管理器；README 写明丢失后果。
- **代理行为回归**：P1 就补单测 + P6 抓包对比；平移时不"顺手优化"任何转发逻辑。
- **新旧同装冲突**：5678 占用检测 + 明确话术。
- **Tauri 固定开销**：体积 2.4MB→~10MB、构建引入 npm——已接受，换工程化。
- 旧版 `claude-model-proxy/` 在 2.0.0 发布并稳定后归档（保留在 git 历史）。
