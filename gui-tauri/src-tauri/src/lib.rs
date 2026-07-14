//! ModelLink — Tauri 入口：窗口 + 托盘 + 菜单 + 代理服务。
//! 代理/网关/配置核心逻辑自 v1 claude-model-proxy 平移（见 proxy.rs / gateway.rs / config.rs）。

use std::sync::Arc;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

mod commands;
mod config;
mod gateway;
mod proxy;

use proxy::ProxyState;

/// 兼容红线 #5：老版 LaunchAgent（com.modellink.plist，指向旧 .app）迁移 ——
/// 存在则删除，并用 tauri-plugin-autostart 重新注册，保持「自启已开启」状态不丢。
#[cfg(target_os = "macos")]
fn migrate_old_launch_agent(app: &tauri::App) {
    use tauri_plugin_autostart::ManagerExt;
    let Ok(home) = std::env::var("HOME") else { return };
    let old_plist =
        std::path::PathBuf::from(home).join("Library/LaunchAgents/com.modellink.plist");
    if old_plist.exists() {
        let _ = std::fs::remove_file(&old_plist);
        match app.autolaunch().enable() {
            Ok(()) => eprintln!("[migrate] v1 LaunchAgent 已迁移到 tauri-plugin-autostart"),
            Err(e) => eprintln!("[migrate] WARN: 重新注册自启失败: {}", e),
        }
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            // macOS：托盘常驻、无 Dock 图标（对齐 v1 Accessory 行为）
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            #[cfg(target_os = "macos")]
            migrate_old_launch_agent(app);

            // ---- 代理核心（与 v1 启动序列一致：先写网关配置，再起代理服务） ----
            let cfg = config::load_config();
            let port = cfg.port;
            gateway::ensure_claude_desktop_gateway(port);
            let _ = config::save_config_file(&cfg);

            eprintln!("ModelLink v{} — Winhao学AI (抖音搜索同名)", env!("CARGO_PKG_VERSION"));
            eprintln!("本软件完全免费，不可商业化");
            eprintln!("Proxy: http://127.0.0.1:{}", port);
            eprintln!("Providers: {}", cfg.providers.len());

            let state = Arc::new(ProxyState::new(cfg).map_err(std::io::Error::other)?);
            app.manage(state.clone());

            // 同步绑定端口。被占用时不再退出（2026-07-14 用户拍板）：
            // 弹提示后继续运行，侧栏显示「代理未运行」，用户可在设置页换端口自救。
            match tauri::async_runtime::block_on(proxy::bind(port)) {
                Ok(listener) => {
                    state.start_serving(listener, port);
                }
                Err(err) => {
                    eprintln!("Cannot start proxy: {}", err);
                    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
                    app.dialog()
                        .message(format!("{}\n\n也可以在「设置」页更换代理端口。", err))
                        .title("ModelLink")
                        .kind(MessageDialogKind::Error)
                        .show(|_| {});
                }
            }

            // macOS：显式挂应用菜单 + 编辑菜单，保证 Accessory 模式下剪贴板快捷键可用（对齐 v1）
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{MenuBuilder, PredefinedMenuItem, SubmenuBuilder};
                let app_sub = SubmenuBuilder::new(app, "ModelLink")
                    .item(&PredefinedMenuItem::hide(app, Some("隐藏 ModelLink"))?)
                    .separator()
                    .item(&PredefinedMenuItem::quit(app, Some("退出 ModelLink"))?)
                    .build()?;
                let edit_sub = SubmenuBuilder::new(app, "编辑")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .select_all()
                    .build()?;
                let menu = MenuBuilder::new(app).items(&[&app_sub, &edit_sub]).build()?;
                app.set_menu(menu)?;
            }

            // 托盘：真 logo 图标 + 菜单（显示窗口/退出）+ 左键唤起
            let show_item = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .tooltip("ModelLink - Winhao学AI")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // 关窗 = 隐藏到托盘（对齐 v1），真正退出走托盘菜单/Cmd+Q
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::gui_version,
            commands::get_config,
            commands::save_config,
            commands::config_hash,
            commands::test_provider,
            commands::apply_to_claude,
            commands::get_logs,
            commands::proxy_status,
            commands::set_port,
            commands::force_quit_and_relaunch
        ])
        .run(tauri::generate_context!())
        .expect("error while running ModelLink");
}
