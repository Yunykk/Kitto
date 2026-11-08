import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";

export function needsLinuxAudioStream(): boolean {
  if (!isTauri()) return false;
  const target = import.meta.env?.TAURI_ENV_PLATFORM;
  if (target) return target === "linux";
  return typeof navigator !== "undefined" && /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent);
}

export function createAudioSource(
  open = (path: string) => invoke<string>("open_audio_stream", { path }),
  close = (url: string) => invoke<void>("close_audio_stream", { url }),
) {
  let revision = 0;
  let active: string | null = null;
  function release() {
    revision++;
    if (active) void close(active).catch(() => {});
    active = null;
  }
  async function load(path: string, ready: (url: string) => void) {
    release();
    const current = revision;
    const url = await open(path);
    if (current !== revision) {
      await close(url).catch(() => {});
      return;
    }
    active = url;
    ready(url);
  }
  return { load, release };
}

export { convertFileSrc };
