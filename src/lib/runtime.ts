import { isTauri } from "@tauri-apps/api/core";

export type RuntimePlatform = "browser" | "desktop" | "android" | "ios";

export function detectRuntimePlatform(native: boolean, target = "", userAgent = ""): RuntimePlatform {
  if (!native) return "browser";
  if (target === "android" || target === "ios") return target;
  if (target) return "desktop";
  if (/Android/i.test(userAgent)) return "android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  return "desktop";
}

export function runtimePlatform(): RuntimePlatform {
  return detectRuntimePlatform(
    isTauri(),
    import.meta.env?.TAURI_ENV_PLATFORM,
    typeof navigator === "undefined" ? "" : navigator.userAgent,
  );
}

export function isDesktopRuntime(): boolean {
  return runtimePlatform() === "desktop";
}
