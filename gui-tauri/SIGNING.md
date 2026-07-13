# ModelLink 签名与发版备忘

## ⚠️ 自动更新私钥（最高优先级）

- 私钥：`~/.modellink-updater/modellink.key`（minisign，无密码）
- 公钥：已写入 `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`
- **丢失私钥 = 所有已安装 2.x 的用户永远收不到后续自动更新**（只能靠官网/抖音通知手动重装）。
- 立即把私钥内容备份到密码管理器（1Password/Bitwarden 等），并异地留一份。
- 不要提交进 git；不要发给任何人。

## Apple 代码签名与公证

- 凭据放 `scripts/signing.local.env`（已 gitignore），模板见 `signing.local.env.example`。
- 与 ClaudeCN 共用同一套 Developer ID 证书 + App Store Connect API Key。

## 发版流程（macOS 本机）

```bash
# 1. 确认版本号（package.json / src-tauri/tauri.conf.json / src-tauri/Cargo.toml 三处一致）
# 2. 更新 RELEASE_NOTES.md（会进 GitHub Release 和应用内更新弹窗）
bash scripts/build-mac.sh        # 构建 + 签名 + 公证（.app、DMG）+ updater 产物
bash scripts/gen-latest-json.sh  # 生成 latest.json（darwin-aarch64）
bash scripts/release-mac.sh      # gh release create + 上传三件套
# Windows 安装包由 GitHub Actions 在 release published 后自动补传（build-windows.yml）
```

- updater endpoint 固定为 `https://github.com/Win-Hao/ModelLink/releases/latest/download/latest.json`，
  所以**每个正式 release 都必须带 latest.json 与 ModelLink.app.tar.gz(+.sig)**。
- Windows 无自动更新（latest.json 只含 darwin-aarch64），Windows 用户手动下 exe。
