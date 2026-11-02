import { onMount } from "svelte";
import {
  clampDb,
  defaultEqualizer,
  equalizerBands,
  equalizerPresetId,
  equalizerPresets,
  normalizeEqualizer,
  type EqualizerSettings,
} from "./equalizer";

const STORAGE_KEY = "kitto.equalizer.v1";

export function createEqualizer(apply: (settings: EqualizerSettings) => void) {
  let settings = $state(defaultEqualizer());
  let isReady = $state(false);
  let error = $state("");
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;

  function snapshot(): EqualizerSettings {
    return { ...settings, gains: [...settings.gains] };
  }

  function flush() {
    clearTimeout(timer);
    timer = undefined;
    if (!dirty) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...snapshot() }));
      dirty = false;
      error = "";
    } catch {
      error = "Could not save your equalizer settings.";
    }
  }

  onMount(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        const data: unknown = JSON.parse(saved);
        if (typeof data !== "object" || data === null || !("version" in data) || data.version !== 1) {
          throw new Error("Invalid equalizer settings.");
        }
        settings = normalizeEqualizer(data);
      }
    } catch {
      error = "Could not load your equalizer settings.";
    }
    try {
      apply(snapshot());
    } catch {
      error = "Could not apply your equalizer settings.";
    }
    isReady = true;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  });

  function update(next: EqualizerSettings) {
    if (!isReady) return;
    const normalized = normalizeEqualizer(next);
    try {
      apply(normalized);
    } catch {
      error = "Could not apply your equalizer settings.";
      return;
    }
    settings = normalized;
    error = "";
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(flush, 250);
  }

  function setBand(index: number, value: number) {
    if (!Number.isInteger(index) || index < 0 || index >= equalizerBands.length || !Number.isFinite(value)) return;
    const gains = [...settings.gains];
    gains[index] = clampDb(value);
    update({ ...settings, gains });
  }

  function usePreset(id: string) {
    const preset = equalizerPresets.find((item) => item.id === id);
    if (preset) update({ ...settings, gains: [...preset.gains] });
  }

  return {
    get settings() { return settings; },
    get preset() { return equalizerPresetId(settings.gains); },
    get isReady() { return isReady; },
    get error() { return error; },
    setBand,
    usePreset,
    setEnabled: (enabled: boolean) => update({ ...settings, enabled }),
    setAutoPreamp: (autoPreamp: boolean) => update({ ...settings, autoPreamp }),
    setPreamp: (preamp: number) => {
      if (Number.isFinite(preamp)) update({ ...settings, preamp: clampDb(preamp, -24, 0) });
    },
    reset: () => update({ ...defaultEqualizer(), enabled: settings.enabled }),
    flush,
  };
}

export type EqualizerController = ReturnType<typeof createEqualizer>;
