import { invoke } from "@tauri-apps/api/core";

// ============================================================
// 后端 IPC 类型化封装 —— 对应 src-tauri 的 #[tauri::command]。
// 契约见 docs/gui-rebuild-tauri.md §5。
// 注意：Config 内部字段是 serde 原名（snake_case，兼容红线 #2）。
// ============================================================

export type ModelEntry = {
  name: string;
  /** 非空（v1 里为 "auto"）表示该模型开启 1M 上下文变体。 */
  to_1m: string;
};

export type ApiKeyEntry = {
  key: string;
  /** 自定义名称（如 01、账号A），用于日志识别轮询到哪个 key。空则不显示。 */
  label: string;
  /** false 时此 key 不参与轮询（账号额度用尽可关闭）。默认 true。 */
  enabled?: boolean;
};

export type Provider = {
  target_url: string;
  /** v1 兼容字段：单 key。新版优先用 api_keys；为空时回退到此字段。 */
  api_key: string;
  /** 多 key 轮询池（2.0 多账号改造）。 */
  api_keys: ApiKeyEntry[];
  models: ModelEntry[];
  /** "" 默认（不干预）/ "off" 关闭思考 / "high" 标准 / "max" 深度 */
  thinking_effort: string;
};

export type Config = {
  providers: Provider[];
  /** 上次成功应用的配置摘要（应用状态机 dirty 判定，后端专管）。 */
  last_applied_hash?: string;
  /** 上次应用时间（Unix 秒字符串）。 */
  last_applied_at?: string;
  /** 代理端口（后端专管，set_port 热切换；缺省 5678）。 */
  port?: number;
};

export type ProxyStatus = { running: boolean; port: number };

export type LogEntry = {
  time: string;
  model: string;
  status: number;
  thinking: string;
  /** 本轮请求使用的密钥 label（2.0 多 key 改造）。空则不显示。 */
  key_label?: string;
};

export type TestResult = { ok: boolean; message: string };

export const guiVersion = () => invoke<string>("gui_version");
export const getConfig = () => invoke<Config>("get_config");
export const saveConfig = (config: Config) => invoke<void>("save_config", { config });
export const configHash = (config: Config) => invoke<string>("config_hash", { config });
export const testProvider = (targetUrl: string, apiKey: string, model: string) =>
  invoke<TestResult>("test_provider", { targetUrl, apiKey, model });
export const applyToClaude = () => invoke<string>("apply_to_claude");
export const getLogs = () => invoke<LogEntry[]>("get_logs");
export const proxyStatus = () => invoke<ProxyStatus>("proxy_status");
export const setPort = (port: number) => invoke<ProxyStatus>("set_port", { port });
