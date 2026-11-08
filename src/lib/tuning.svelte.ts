import { onMount } from "svelte";
import { isTuningFrequency, type TuningTarget } from "./tuning";

const KEY = "kitto.tuning.v1";

export function createTuning(apply: (target: TuningTarget) => Promise<void>) {
  let target = $state<TuningTarget>(null);
  let requested = $state<TuningTarget>(null);
  let isReady = $state(false);
  let isApplying = $state(false);
  let error = $state("");
  let revision = 0;
  let disposed = false;

  async function setTarget(next: TuningTarget, save = true): Promise<boolean> {
    if (disposed || (next !== null && !isTuningFrequency(next))) return false;
    const current = ++revision;
    requested = next;
    isApplying = true;
    error = "";
    try {
      await apply(next);
      if (disposed || current !== revision) return false;
      target = next;
      if (save) {
        try { localStorage.setItem(KEY, JSON.stringify({ version: 1, frequency: next })); }
        catch { error = "Tuning changed, but could not be saved."; }
      }
      return true;
    } catch (cause) {
      if (disposed || current !== revision) return false;
      requested = target;
      error = cause instanceof Error ? cause.message : "Could not change tuning.";
      try { await apply(target); }
      catch { error = "Could not restore audio processing. Try Original or restart the player."; }
      return false;
    } finally {
      if (!disposed && current === revision) isApplying = false;
    }
  }

  onMount(() => {
    let saved: TuningTarget = null;
    let loadError = "";
    try {
      const raw = localStorage.getItem(KEY);
      if (raw !== null) {
        const data: unknown = JSON.parse(raw);
        if (typeof data !== "object" || data === null || !("version" in data) || data.version !== 1 ||
            !("frequency" in data) || (data.frequency !== null && !isTuningFrequency(data.frequency))) {
          throw new Error("Invalid tuning settings");
        }
        saved = data.frequency;
      }
    } catch { loadError = "Could not load tuning settings. Choose a preset to save new settings."; }
    void setTarget(saved, false).then(() => {
      if (disposed) return;
      isReady = true;
      if (loadError && !error) error = loadError;
    });
    return () => { disposed = true; revision++; };
  });

  return {
    get target() { return target; },
    get requested() { return requested; },
    get isReady() { return isReady; },
    get isApplying() { return isApplying; },
    get error() { return error; },
    setTarget,
  };
}

export type TuningController = ReturnType<typeof createTuning>;
