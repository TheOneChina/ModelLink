//! Tauri 命令层（IPC 契约见 docs/gui-rebuild-tauri.md §5）。
//! test_provider / apply 的校验与话术自 v1 /api/* handlers 平移，行为等价。

use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use crate::config::{canonical_hash, save_config_file, Config};
use crate::gateway;
use crate::proxy::{LogEntry, ProxyState};

/// GUI 自身版本号（供前端设置页显示）。
#[tauri::command]
pub fn gui_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub fn get_config(state: State<'_, Arc<ProxyState>>) -> Config {
    state.config.read().unwrap_or_else(|e| e.into_inner()).clone()
}

#[tauri::command]
pub fn save_config(state: State<'_, Arc<ProxyState>>, mut config: Config) -> Result<(), String> {
    // applied 哈希由后端专管（apply_to_claude 里更新），忽略前端回传值防止漂移。
    config.last_applied_hash = state
        .config
        .read()
        .unwrap_or_else(|e| e.into_inner())
        .last_applied_hash
        .clone();
    save_config_file(&config)?;
    *state.config.write().unwrap_or_else(|e| e.into_inner()) = config;
    eprintln!("[config] saved");
    Ok(())
}

/// 规范化配置摘要（design.md §8 应用状态机的 dirty 判定，前后端共用同一实现）。
#[tauri::command]
pub fn config_hash(config: Config) -> String {
    canonical_hash(&config)
}

#[derive(Serialize)]
pub struct TestResult {
    pub ok: bool,
    pub message: String,
}

/// 连接测试：1 token 试探请求（平移 v1 test_handler，话术不变）。
#[tauri::command]
pub async fn test_provider(
    state: State<'_, Arc<ProxyState>>,
    target_url: String,
    api_key: String,
    model: String,
) -> Result<TestResult, String> {
    if target_url.is_empty() || api_key.is_empty() || model.is_empty() {
        return Ok(TestResult {
            ok: false,
            message: "Please fill in URL, Key, and model name.".into(),
        });
    }
    if !target_url.starts_with("http://") && !target_url.starts_with("https://") {
        return Ok(TestResult {
            ok: false,
            message: "URL must start with http:// or https://".into(),
        });
    }

    let base = target_url.trim_end_matches('/');
    let url = format!("{}/v1/messages", base);
    let body = serde_json::json!({
        "model": model,
        "max_tokens": 1,
        "messages": [{"role": "user", "content": "hi"}]
    });

    let test_client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_else(|_| state.client.clone());

    let resp = test_client
        .post(&url)
        .header("content-type", "application/json")
        .header("authorization", format!("Bearer {}", api_key))
        .header("anthropic-version", "2023-06-01")
        .body(serde_json::to_vec(&body).unwrap_or_default())
        .send()
        .await;

    match resp {
        Ok(r) => {
            let status = r.status().as_u16();
            if status == 200 {
                Ok(TestResult {
                    ok: true,
                    message: format!("Connection successful! (HTTP {})", status),
                })
            } else {
                let body = r.text().await.unwrap_or_default();
                let msg = serde_json::from_str::<serde_json::Value>(&body)
                    .ok()
                    .and_then(|v| {
                        v.get("error")
                            .and_then(|e| e.get("message"))
                            .and_then(|m| m.as_str())
                            .map(String::from)
                    })
                    .unwrap_or_else(|| format!("HTTP {}", status));
                Ok(TestResult { ok: false, message: msg })
            }
        }
        Err(e) => {
            let msg = if e.is_connect() {
                "Cannot connect. Check the URL.".to_string()
            } else if e.is_timeout() {
                "Connection timed out.".to_string()
            } else {
                format!("Error: {}", e)
            };
            Ok(TestResult { ok: false, message: msg })
        }
    }
}

/// 应用到 Claude Desktop：校验 → 写网关 → 更新 applied 哈希 → 重启 Claude。
/// （前端在调用前先 flush 自动保存，保证 state 里是最新配置。）
#[tauri::command]
pub async fn apply_to_claude(state: State<'_, Arc<ProxyState>>) -> Result<String, String> {
    let mut config = state.config.read().unwrap_or_else(|e| e.into_inner()).clone();
    let msg = gateway::apply_to_claude_desktop(&config)?;
    eprintln!("[apply] {}", msg);

    // design.md §8：apply 成功后持久化 last_applied_hash（写盘失败不回滚 apply，仅打日志）
    config.last_applied_hash = canonical_hash(&config);
    if let Err(e) = save_config_file(&config) {
        eprintln!("[apply] WARN: persist last_applied_hash failed: {}", e);
    }
    *state.config.write().unwrap_or_else(|e| e.into_inner()) = config;

    gateway::restart_claude_desktop();
    Ok("Applied! Claude Desktop is restarting...".to_string())
}

#[tauri::command]
pub fn get_logs(state: State<'_, Arc<ProxyState>>) -> Vec<LogEntry> {
    state.logs.read().unwrap_or_else(|e| e.into_inner()).clone()
}
