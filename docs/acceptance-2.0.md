# ModelLink 2.0.0 验收记录（施工文档 §9）

> 2026-07-14 由 Claude 执行自动可验证项；真机项待用户手动验证后勾选。
> 复跑等价回归：`OLD_BIN=<v1二进制> NEW_BIN=<v2二进制> bash gui-tauri/regression/run.sh`

## 自动验证 — 已全部通过 ✅

| # | 验收项 | 结果 | 验证方式 |
|---|---|---|---|
| 1 | 本机现有 config.json 直接启动，服务商无损 | ✅ | 真配置启动：Providers=2，/v1/models 输出 Kimi+mimo 含 [1m] 变体；serde round-trip 单测锁定格式 |
| 3 | /v1/models 与旧版 diff 一致 | ✅ | 新旧二进制同配置逐字节 diff 相同 |
| 3 | [1m] 变体 / thinking 三态注入抓包一致 | ✅ | 假上游捕获 7 类转发请求（4 种 thinking、[1m]、fallback、头透传、路径拼接），新旧 JSONL 逐字节一致 |
| 3+ | 404/502 话术、响应透传体、状态码 | ✅ | 同上 diff 一致 |
| 3+ | Claude-3p 网关写入（UUID/_meta/desktop_config） | ✅ | temp HOME 下新旧写入文件逐字节一致（红线 #3） |
| 5 | 老 com.modellink.plist 迁移 | ✅ | temp HOME 种旧 plist → 启动后被删除，新注册 ModelLink.plist（autostart 插件） |
| 8 | 水印防篡改 | ✅ | Chrome 无头注入攻击 5 项全过：remove() 拦截 / replaceChildren 硬删 1.2s 内恢复 / 文本篡改恢复 / display:none 恢复 |
| 9 | 端口冲突友好提示 | ✅ | 5678 被占时 stderr + 原生弹窗，话术与 v1 逐字一致（"Port 5678 already in use… Please close the other instance first."） |
| 10 | 体积与启动耗时 | ✅ | .app 11MB（DMG 5.5MB）符合预期 ~10MB；启动→代理可服务 0.57s（v1 含固定 800ms sleep，更慢） |
| — | cargo test / clippy -D warnings / tsc | ✅ | 20/20 单测；clippy 严格模式零警告；tsc 零错误 |
| — | 签名/公证 | ✅ | spctl: accepted · source=Notarized Developer ID；DMG 已 staple |
| — | updater 产物 | ✅ | ModelLink.app.tar.gz + .sig + latest.json(darwin-aarch64) 已生成 |

## 待用户真机验证 ⬜（需要 Claude Desktop / 第二台机器 / 发版配合）

- [ ] **macOS 真机对话**：打开新 ModelLink.app → 概览页确认现有服务商无损 → Claude Desktop 经 5678 对话成功 → 请求日志出现记录
- [ ] **应用到 Claude Desktop**：改一点配置 → 点应用 → Claude 自动重启并接入（macOS）
- [ ] **托盘交互**：关窗隐藏 / 托盘左键唤起 / 菜单退出；无 Dock 图标；⌘C/⌘V 在输入框可用
- [ ] **自更新端到端**（发版时）：装 2.0.0 → 发一个 2.0.1 测试 release（含 latest.json）→ 应用内提示 → 下载/验签/安装/重启成功
- [ ] **Windows 全链路**（Windows 机器）：NSIS 安装 → 配置 → 应用到 Claude Desktop（含 MSIX 版）→ 对话 → 开机自启注册表项生效（v2 修复项，重点）
- [ ] **双平台自启**：设置页开关后重启系统验证

## 发版前置（等用户确认）

1. **备份 minisign 私钥** `~/.modellink-updater/modellink.key` → 密码管理器（丢失=老用户永收不到更新）
2. push 本地 `main` 到 GitHub（v1 历史保留在 `master` + tags；建议 push 后把默认分支切到 main）
3. 真机清单过完 → `bash scripts/release-mac.sh` 发 v2.0.0（Windows exe 由 CI 自动补传）
