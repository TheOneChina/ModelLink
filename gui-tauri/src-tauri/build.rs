// ModelLink 只写用户可写目录（~/.claude-model-proxy、Claude-3p 的用户数据目录），
// 不需要 Windows 提权清单（区别于 ClaudeCN），走 Tauri 默认清单即可。
fn main() {
    tauri_build::build();
}
