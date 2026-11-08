use serde_json::{Value, json};
use tauri::{
    AppHandle, Manager, Runtime, State,
    plugin::{Builder, PluginHandle, TauriPlugin},
};

struct AndroidAudio<R: Runtime>(PluginHandle<R>);

#[tauri::command]
async fn request<R: Runtime>(
    _app: AppHandle<R>,
    state: State<'_, AndroidAudio<R>>,
    command: String,
    payload: Option<Value>,
) -> Result<Value, String> {
    state
        .0
        .run_mobile_plugin_async(
            "request",
            json!({ "command": command, "payload": payload.unwrap_or_else(|| json!({})) }),
        )
        .await
        .map_err(|error| error.to_string())
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("android-audio")
        .invoke_handler(tauri::generate_handler![request])
        .setup(|app, api| {
            let handle = api.register_android_plugin("app.kitto.audio", "AndroidAudioPlugin")?;
            app.manage(AndroidAudio(handle));
            Ok(())
        })
        .build()
}
