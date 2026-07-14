//! 本地代理（127.0.0.1:5678）：/v1/models 列表 + 消息流式转发。
//! 平移 v1 claude-model-proxy main.rs:642-1065 —— 行为逐字节等价，禁止顺手优化。
//! 与 v1 的差异仅有：不再 serve UI 与 /api/*（那些职责移交 Tauri 命令层）。
//!
//! ⚠️ 兼容红线（docs/gui-rebuild-tauri.md §3 #1/#4）：
//! - 端口 5678 不变；被占时报 v1 原话术并退出
//! - thinking_effort 注入三态、anthropic-beta / x-api-key / user-agent 透传、
//!   /v1/models 响应格式、流式转发、10MB body 上限、无匹配 fallback 第一个模型

use axum::{
    body::Body,
    extract::State,
    http::{HeaderMap, Method, StatusCode},
    response::{IntoResponse, Json},
    Router,
};
use reqwest::Client;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use tokio::net::TcpListener;

use crate::config::{flatten_config, resolve_model, Config, ResolvedModel};

pub const MAX_LOGS: usize = 100;

#[derive(Serialize, Clone)]
pub struct LogEntry {
    pub time: String,
    pub model: String,
    pub status: u16,
    pub thinking: String,
}

/// 代理与命令层共享的全局状态（与 v1 AppState 同构 + 2.0 运行态：端口热切换）。
pub struct ProxyState {
    pub config: RwLock<Config>,
    pub client: Client,
    pub logs: RwLock<Vec<LogEntry>>,
    /// 代理是否在监听（端口被占时为 false，app 不退出，侧栏显示未运行）。
    pub running: AtomicBool,
    /// 实际绑定的端口（未运行时无意义）。
    pub bound_port: AtomicU16,
    /// 当前 serve 任务句柄，切换端口时 abort 旧任务释放监听。
    pub serve_handle: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

impl ProxyState {
    pub fn new(config: Config) -> Result<Self, String> {
        Ok(Self {
            config: RwLock::new(config),
            client: Client::builder()
                .connect_timeout(std::time::Duration::from_secs(30))
                .timeout(std::time::Duration::from_secs(300))
                .build()
                .map_err(|e| format!("Failed to create HTTP client: {}", e))?,
            logs: RwLock::new(Vec::new()),
            running: AtomicBool::new(false),
            bound_port: AtomicU16::new(0),
            serve_handle: Mutex::new(None),
        })
    }

    /// 在已绑定的 listener 上启动 serve 任务并登记运行态（替换旧任务）。
    pub fn start_serving(self: &Arc<Self>, listener: TcpListener, port: u16) {
        let mut guard = self.serve_handle.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(old) = guard.take() {
            old.abort();
        }
        let state = self.clone();
        *guard = Some(tauri::async_runtime::spawn(serve(listener, state)));
        self.running.store(true, Ordering::SeqCst);
        self.bound_port.store(port, Ordering::SeqCst);
    }
}

pub fn chrono_now() -> String {
    let d = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let offset_secs: i64 = {
        #[cfg(target_os = "macos")]
        {
            let mut now: libc::time_t = 0;
            let mut tm: libc::tm = unsafe { std::mem::zeroed() };
            unsafe {
                libc::time(&mut now);
                libc::localtime_r(&now, &mut tm);
            }
            tm.tm_gmtoff
        }
        #[cfg(not(target_os = "macos"))]
        {
            8 * 3600
        }
    };
    let local = (d as i64 + offset_secs) as u64;
    let h = (local % 86400) / 3600;
    let m = (local % 3600) / 60;
    let s = local % 60;
    format!("{:02}:{:02}:{:02}", h, m, s)
}

/// /v1/models 响应体（从 v1 proxy_fallback 内联代码原样抽出，便于单测与回归 diff）。
pub(crate) fn models_json(config: &Config) -> serde_json::Value {
    let flat = flatten_config(config);
    let mut models: Vec<serde_json::Value> = Vec::new();
    for e in &flat {
        models.push(serde_json::json!({
            "id": e.slot,
            "display_name": e.name,
            "created": 0
        }));
        if !e.to_1m.is_empty() {
            models.push(serde_json::json!({
                "id": format!("{}[1m]", e.slot),
                "display_name": format!("{} (1M)", e.name),
                "created": 0
            }));
        }
    }
    serde_json::json!({ "data": models })
}

/// thinking_effort 注入三态（从 v1 proxy_fallback 内联代码原样抽出）：
/// ""=不干预 / "off"=disabled+移除 output_config / 其余=enabled+output_config.effort。
/// 返回写入日志的 thinking 标签。
pub(crate) fn inject_thinking(data: &mut serde_json::Value, te: &str) -> String {
    if !te.is_empty() && te != "off" {
        data["thinking"] = serde_json::json!({"type": "enabled", "budget_tokens": 8192});
        data["output_config"] = serde_json::json!({"effort": te});
        eprintln!("  thinking_effort: {}", te);
        te.to_string()
    } else if te == "off" {
        data["thinking"] = serde_json::json!({"type": "disabled"});
        data.as_object_mut().map(|o| o.remove("output_config"));
        eprintln!("  thinking: disabled");
        "off".to_string()
    } else {
        String::new()
    }
}

async fn proxy_fallback(
    State(state): State<Arc<ProxyState>>,
    req: axum::http::Request<Body>,
) -> axum::response::Response {
    let (parts, body) = req.into_parts();

    if parts.method == Method::GET && parts.uri.path().contains("/v1/models") {
        let config = state.config.read().unwrap_or_else(|e| e.into_inner()).clone();
        return Json(models_json(&config)).into_response();
    }

    if parts.method != Method::POST {
        return (StatusCode::NOT_FOUND, "Not Found").into_response();
    }

    let body_bytes = match axum::body::to_bytes(body, 10 * 1024 * 1024).await {
        Ok(b) => b,
        Err(e) => return (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    };

    let config = state.config.read().unwrap_or_else(|e| e.into_inner()).clone();

    let mut data: serde_json::Value = match serde_json::from_slice(&body_bytes) {
        Ok(d) => d,
        Err(e) => return (StatusCode::BAD_REQUEST, e.to_string()).into_response(),
    };

    let resolved = if let Some(model) = data.get("model").and_then(|m| m.as_str()) {
        let r = resolve_model(model, &config);
        eprintln!("  model: {} -> {} ({})", model, r.model, r.target_url);
        data["model"] = serde_json::json!(r.model);
        r
    } else {
        ResolvedModel {
            model: String::new(),
            target_url: String::new(),
            api_key: String::new(),
            thinking_effort: String::new(),
        }
    };

    // Inject thinking effort from provider config
    let thinking_log = inject_thinking(&mut data, &resolved.thinking_effort);

    if resolved.target_url.is_empty() {
        eprintln!("  error: no target URL configured for this model");
        return (StatusCode::BAD_GATEWAY, "No API URL configured for this model. Please configure the provider in the proxy app.").into_response();
    }

    let base = resolved.target_url.trim_end_matches('/');
    let url = format!("{}{}", base, parts.uri.path());

    let mut req_builder = state
        .client
        .post(&url)
        .header("content-type", "application/json")
        .header("authorization", format!("Bearer {}", resolved.api_key))
        .header(
            "anthropic-version",
            parts
                .headers
                .get("anthropic-version")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("2023-06-01"),
        );

    for h in ["anthropic-beta", "x-api-key", "user-agent"] {
        if let Some(v) = parts.headers.get(h).and_then(|v| v.to_str().ok()) {
            req_builder = req_builder.header(h, v);
        }
    }

    let resp = match req_builder
        .body(serde_json::to_vec(&data).unwrap_or_default())
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            eprintln!("  proxy error: {}", e);
            return (StatusCode::BAD_GATEWAY, format!("Proxy error: {}", e)).into_response();
        }
    };

    let raw_status = resp.status().as_u16();
    let status = StatusCode::from_u16(raw_status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);

    if let Some(model) = data.get("model").and_then(|m| m.as_str()) {
        let entry = LogEntry {
            time: chrono_now(),
            model: model.to_string(),
            status: raw_status,
            thinking: thinking_log.clone(),
        };
        let mut logs = state.logs.write().unwrap_or_else(|e| e.into_inner());
        logs.push(entry);
        let len = logs.len();
        if len > MAX_LOGS {
            logs.drain(0..len - MAX_LOGS);
        }
    }

    let mut headers = HeaderMap::new();
    for (k, v) in resp.headers() {
        if k != "transfer-encoding" && k != "connection" {
            headers.insert(k.clone(), v.clone());
        }
    }

    let stream = resp.bytes_stream();
    let body = Body::from_stream(stream);

    (status, headers, body).into_response()
}

/// 绑定端口。失败时返回 v1 原话术（含「请先关闭另一个实例」语义），由调用方提示。
pub async fn bind(port: u16) -> Result<TcpListener, String> {
    TcpListener::bind(format!("127.0.0.1:{}", port))
        .await
        .map_err(|e| format!("Port {} already in use: {}. Please close the other instance first.", port, e))
}

/// 在已绑定的 listener 上常驻服务。axum 只保留代理职责：/v1/models + fallback 转发。
pub async fn serve(listener: TcpListener, state: Arc<ProxyState>) {
    let app = Router::new().fallback(proxy_fallback).with_state(state);
    eprintln!("Server ready.");
    if let Err(e) = axum::serve(listener, app).await {
        eprintln!("Server error: {}", e);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{ModelEntry, Provider};

    fn cfg_one(te: &str) -> Config {
        Config {
            providers: vec![Provider {
                target_url: "https://a.example.com".into(),
                api_key: "k".into(),
                models: vec![
                    ModelEntry { name: "m-with-1m".into(), to_1m: "auto".into() },
                    ModelEntry { name: "m-plain".into(), to_1m: "".into() },
                ],
                thinking_effort: te.into(),
            }],
            ..Default::default()
        }
    }

    // ---- /v1/models 响应格式（红线 #4：与旧版 diff 一致） ----

    #[test]
    fn models_json_lists_slots_and_1m_variants() {
        let v = models_json(&cfg_one(""));
        let data = v.get("data").unwrap().as_array().unwrap();
        assert_eq!(data.len(), 3); // slot1 + slot1[1m] + slot2
        assert_eq!(data[0]["id"], "claude-3-opus-latest");
        assert_eq!(data[0]["display_name"], "m-with-1m");
        assert_eq!(data[0]["created"], 0);
        assert_eq!(data[1]["id"], "claude-3-opus-latest[1m]");
        assert_eq!(data[1]["display_name"], "m-with-1m (1M)");
        assert_eq!(data[2]["id"], "claude-3-5-sonnet-latest");
        assert_eq!(data[2]["display_name"], "m-plain");
    }

    #[test]
    fn models_json_empty_config_gives_empty_data() {
        let v = models_json(&Config::default());
        assert_eq!(v, serde_json::json!({ "data": [] }));
    }

    // ---- thinking 注入三态（红线 #4） ----

    #[test]
    fn inject_thinking_default_leaves_body_untouched() {
        let mut data = serde_json::json!({"model": "m", "max_tokens": 1});
        let tag = inject_thinking(&mut data, "");
        assert_eq!(tag, "");
        assert_eq!(data, serde_json::json!({"model": "m", "max_tokens": 1}));
    }

    #[test]
    fn inject_thinking_off_disables_and_strips_output_config() {
        let mut data = serde_json::json!({"model": "m", "output_config": {"effort": "high"}});
        let tag = inject_thinking(&mut data, "off");
        assert_eq!(tag, "off");
        assert_eq!(data["thinking"], serde_json::json!({"type": "disabled"}));
        assert!(data.get("output_config").is_none());
    }

    #[test]
    fn inject_thinking_high_enables_with_budget_and_effort() {
        let mut data = serde_json::json!({"model": "m"});
        let tag = inject_thinking(&mut data, "high");
        assert_eq!(tag, "high");
        assert_eq!(
            data["thinking"],
            serde_json::json!({"type": "enabled", "budget_tokens": 8192})
        );
        assert_eq!(data["output_config"], serde_json::json!({"effort": "high"}));
    }

    #[test]
    fn inject_thinking_max_enables_with_effort_max() {
        let mut data = serde_json::json!({"model": "m"});
        let tag = inject_thinking(&mut data, "max");
        assert_eq!(tag, "max");
        assert_eq!(data["output_config"], serde_json::json!({"effort": "max"}));
    }
}
