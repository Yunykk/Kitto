import { onMount } from "svelte";
import { emptyListeningData, LISTENING_STORAGE_KEY, parseListeningData, recordListening, summarizeListening } from "./listening";
import type { ListeningCredit } from "./listening-types";

export function createListeningStats() {
  let data = $state.raw(emptyListeningData());
  let available = $state.raw<ReadonlySet<string>>(new Set());
  let isReady = $state(false);
  let error = $state("");
  let now = $state(Date.now());
  let writable = false;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const resetListeners = new Set<() => void>();
  const summary = $derived(summarizeListening(data, available, now));

  function flush() {
    clearTimeout(timer);
    timer = undefined;
    if (!dirty || !writable) return;
    try {
      localStorage.setItem(LISTENING_STORAGE_KEY, JSON.stringify(data));
      dirty = false;
      error = "";
    } catch {
      error = "Listening stats are updating, but could not be saved.";
    }
  }

  onMount(() => {
    try {
      const saved = localStorage.getItem(LISTENING_STORAGE_KEY);
      if (saved !== null) {
        const parsed = parseListeningData(JSON.parse(saved));
        if (!parsed) throw new Error("Invalid listening statistics.");
        data = parsed;
      }
      writable = true;
    } catch {
      error = "Could not load your listening stats. Saved data was kept. Clear statistics to start again.";
    }
    isReady = true;
    const clock = setInterval(() => { now = Date.now(); }, 60000);
    window.addEventListener("pagehide", flush);
    return () => {
      flush();
      clearInterval(clock);
      window.removeEventListener("pagehide", flush);
    };
  });

  function record(credit: ListeningCredit) {
    if (!isReady || !writable) return;
    const next = recordListening(data, credit);
    if (next === data) return;
    data = next;
    now = Date.now();
    dirty = true;
    if (timer === undefined) timer = setTimeout(flush, 10000);
  }

  function clear(): boolean {
    if (!isReady) return false;
    const next = emptyListeningData();
    try {
      localStorage.setItem(LISTENING_STORAGE_KEY, JSON.stringify(next));
    } catch {
      error = "Could not clear your listening statistics.";
      return false;
    }
    clearTimeout(timer);
    timer = undefined;
    data = next;
    dirty = false;
    writable = true;
    now = Date.now();
    error = "";
    for (const callback of resetListeners) callback();
    return true;
  }

  return {
    get summary() { return summary; },
    get isReady() { return isReady; },
    get error() { return error; },
    record, clear, flush,
    setAvailableTracks(ids: readonly string[]) {
      if (available.size !== ids.length || ids.some((id) => !available.has(id))) available = new Set(ids);
    },
    onReset(callback: () => void) {
      resetListeners.add(callback);
      return () => { resetListeners.delete(callback); };
    },
  };
}

export type ListeningStatsController = ReturnType<typeof createListeningStats>;
