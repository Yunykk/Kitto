import { invoke } from "@tauri-apps/api/core";
import { runtimePlatform } from "./runtime";

export function isAndroidAudio(): boolean {
  return runtimePlatform() === "android";
}

export function androidRequest<T>(command: string, payload: Record<string, unknown> = {}): Promise<T> {
  return invoke<T>("plugin:android-audio|request", { command, payload });
}
