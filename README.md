# ModelLink

> **本软件完全免费，仅供个人学习和非商业用途。严禁任何形式的商业化行为，包括但不限于出售、收费分发、嵌入付费产品等。**
>
> 作者：**抖音Winhao学AI**（抖音号：**54927876676**）
>
> 如果你是花钱买到的这个软件，你被骗了，请举报卖家。

让 Claude Desktop 桌面端接入任意第三方 API 模型的本地代理工具。

## 功能

- 将第三方模型（DeepSeek、Kimi、智谱 GLM 等）接入 Claude Desktop
- 支持同时配置多个 API 服务商，按模型自动路由
- Claude Desktop 模型选择器中直接显示真实模型名称
- 支持 1M 上下文模型变体
- 可视化配置界面，无需手动编辑配置文件
- 菜单栏/系统托盘常驻，关闭窗口后代理继续运行
- 深色/亮色/跟随系统主题切换
- 连接测试、请求日志、开机自启

## 下载

从 [Releases](../../releases) 页面下载：

| 平台 | 文件 |
|------|------|
| macOS | `ModelLink.app.zip` |
| Windows | `ModelLink-Windows.zip` |

## 安装

### macOS

1. 解压 `ModelLink-macOS.zip`
2. 将 `ModelLink.app` 拖入「应用程序」文件夹
3. 首次打开如果提示"已损坏"，在终端执行：
   ```bash
   xattr -cr /Applications/ModelLink.app
   ```
4. 双击打开即可

### Windows

1. 解压 `ModelLink-Windows.zip`
2. 确保 `ModelLink.exe` 和 `WebView2Loader.dll` 在同一目录
3. 双击 `ModelLink.exe` 运行
4. 首次运行如果触发 Windows Defender 警告，选择「仍然运行」

## 首次使用

### 1. 初始化 Claude Desktop（仅首次需要）

ModelLink 需要 Claude Desktop 开启第三方推理模式。首次使用或重置数据后，需手动操作一次：

1. 打开 Claude Desktop，完成初始启动
2. 菜单栏进入 **Help > Troubleshooting > Enable Developer Mode**
3. 重启 Claude Desktop
4. 菜单栏进入 **Developer > Configure third-party inference**
5. Backend 选择 **Gateway (Anthropic-compatible)**
6. Gateway URL 填写 `http://127.0.0.1:5678`
7. API Key 填写 `proxy`
8. 点击 **Apply locally**

完成后，后续所有配置通过 ModelLink 管理，无需再手动操作。

### 2. 配置 ModelLink

1. 打开 ModelLink
2. 点击「添加服务商」
3. 填写 API 地址和密钥
4. 添加模型名称（填什么名称，Claude Desktop 中就显示什么）
5. 点击「保存配置」
6. 点击「应用到 Claude Desktop」— Claude Desktop 会自动重启

### 3. 开始使用

在 Claude Desktop 的模型选择器中选择你配置的模型即可。

## 多服务商示例

可以同时接入多个厂商，按模型自动路由到不同 API：

```
服务商 1: DeepSeek
  API: https://api.deepseek.com/anthropic
  模型: deepseek-v4-pro, deepseek-v4-flash

服务商 2: Kimi
  API: https://api.kimi.com/coding/
  模型: kimi-k2.6
```

Claude Desktop 中会同时显示所有模型，选择后自动路由到对应厂商。

## Windows 注意事项

- 需要 WebView2 Runtime（Windows 10/11 自带 Edge 的通常已有）
- `ModelLink.exe` 和 `WebView2Loader.dll` 需放在同一目录
- 首次运行可能触发 Windows Defender 警告，选择「仍然运行」即可

## 技术原理

ModelLink 在本地 `127.0.0.1:5678` 运行一个代理服务：

```
Claude Desktop → 发送 Anthropic 模型名 → ModelLink 代理 → 替换为真实模型名 → 第三方 API
```

Claude Desktop 的 Gateway 指向本地代理，代理根据配置的映射关系将请求转发到对应的 API 服务商。

## 构建

需要 Rust 工具链：

```bash
# macOS
cargo build --release

# Windows（交叉编译）
rustup target add x86_64-pc-windows-gnu
brew install mingw-w64
cargo build --release --target x86_64-pc-windows-gnu
```

## 免责声明与版权

- 本软件由 **抖音Winhao学AI**（抖音号：**54927876676**）开发并免费提供
- **完全免费，不可商业化** — 禁止任何形式的售卖、收费分发、打包进付费产品
- 欢迎免费转发分享，但必须保留原始作者信息，不得篡改或移除软件内的水印和版权声明
- 如发现有人售卖本软件，请联系作者举报

## 许可证

本项目采用 [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/) 许可证 — 署名-非商业性使用-禁止演绎。

- **署名**：必须注明原作者（抖音Winhao学AI）
- **非商业性使用**：不得用于任何商业目的
- **禁止演绎**：不得修改后再分发（防止去除水印后转卖）
