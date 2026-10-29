import { onMount } from "svelte";
import {
  APPEARANCE_KEY, accentColors, defaultAppearance, isThemeId, normalizeHex, parseAppearance,
  type AppearanceSettings, type ColorMode, type ThemeId,
} from "./appearance";

export function createAppearance() {
  let settings = $state<AppearanceSettings>({ ...defaultAppearance });
  let error = $state("");
  let isReady = $state(false);

  function apply() {
    const root = document.documentElement;
    const colors = accentColors(settings.accent, settings.mode);
    root.dataset.theme = settings.theme;
    root.dataset.mode = settings.mode;
    root.style.colorScheme = settings.mode;
    root.style.setProperty("--color-accent", colors.accent);
    root.style.setProperty("--color-accent-ink", colors.ink);
    root.style.setProperty("--color-on-accent", colors.onAccent);
  }

  onMount(() => {
    try {
      const saved = localStorage.getItem(APPEARANCE_KEY);
      if (saved !== null) settings = parseAppearance(JSON.parse(saved));
    } catch {
      error = "Could not load appearance settings.";
    }
    isReady = true;
    apply();
  });

  function update(next: AppearanceSettings): boolean {
    if (!isReady) return false;
    settings = next;
    apply();
    try {
      localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ version: 1, ...next }));
      error = "";
      return true;
    } catch {
      error = "Appearance changed, but could not be saved.";
      return false;
    }
  }

  return {
    get theme() { return settings.theme; },
    get mode() { return settings.mode; },
    get accent() { return settings.accent; },
    get error() { return error; },
    get isReady() { return isReady; },
    setTheme(theme: ThemeId) {
      return isThemeId(theme) && update({ ...settings, theme });
    },
    setMode(mode: ColorMode) {
      return (mode === "light" || mode === "dark") && update({ ...settings, mode });
    },
    setAccent(value: string) {
      const accent = normalizeHex(value);
      return accent !== null && update({ ...settings, accent });
    },
    reset() { return update({ ...defaultAppearance }); },
  };
}

export type AppearanceController = ReturnType<typeof createAppearance>;
