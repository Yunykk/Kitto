#[cfg(desktop)]
use tauri_plugin_window_state::{Builder as WindowStateBuilder, StateFlags};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_dialog::init());

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
