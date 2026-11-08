#[cfg(desktop)]
use tauri_plugin_window_state::{Builder as WindowStateBuilder, StateFlags};

#[cfg(target_os = "linux")]
mod linux_audio;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(target_os = "android")]
    let builder = builder.plugin(tauri_plugin_android_audio::init());

    #[cfg(target_os = "linux")]
    let builder = builder
        .invoke_handler(tauri::generate_handler![
            linux_audio::open_audio_stream,
            linux_audio::close_audio_stream,
        ])
        .on_page_load(|webview, payload| {
            if webview.label() == "main"
                && payload.event() == tauri::webview::PageLoadEvent::Started
            {
                linux_audio::clear_streams();
            }
        });

    #[cfg(desktop)]
    let builder = builder.plugin(
        WindowStateBuilder::default()
            .with_state_flags(
                StateFlags::SIZE
                    | StateFlags::POSITION
                    | StateFlags::MAXIMIZED
                    | StateFlags::FULLSCREEN,
            )
            .build(),
    );

    builder
        .run(tauri::generate_context!())
        .expect("error while running Kitto");
}
