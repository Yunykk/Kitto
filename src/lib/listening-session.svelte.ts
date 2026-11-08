import { onMount } from "svelte";
import { isDesktopRuntime } from "./runtime";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getAudioPlayback, onAudioPlayback, type AudioPlaybackSnapshot } from "./audio";
import { createListeningTracker } from "./listening-tracker";
import type { ListeningTrack } from "./listening-types";
import type { ListeningStatsController } from "./listening.svelte";

export function observeListening(getStats: () => ListeningStatsController, getTrack: (path: string) => ListeningTrack | null) {
  let flush = () => {};
  onMount(() => {
    const stats = getStats();
    const tracker = createListeningTracker(stats.record);
    const sample = (value: AudioPlaybackSnapshot) => {
      tracker.sample({ ...value, position: value.currentTime, track: value.path ? getTrack(value.path) : null });
      if (!value.active) stats.flush();
    };
    const unsubscribe = onAudioPlayback(sample);
    const checkpoint = () => {
      sample(getAudioPlayback());
      tracker.flush();
      stats.flush();
    };
    flush = checkpoint;
    const removeReset = stats.onReset(() => {
      tracker.reset();
      sample(getAudioPlayback());
    });
    const onVisibility = () => {
      if (document.visibilityState === "hidden") checkpoint();
    };
    window.addEventListener("pagehide", checkpoint);
    document.addEventListener("visibilitychange", onVisibility);
    let disposed = false;
    let removeClose: (() => void) | undefined;
    if (isDesktopRuntime()) {
      void getCurrentWindow().onCloseRequested(checkpoint).then((unlisten) => {
        if (disposed) unlisten();
        else removeClose = unlisten;
      }).catch(() => {});
    }
    return () => {
      disposed = true;
      checkpoint();
      unsubscribe();
      removeReset();
      removeClose?.();
      window.removeEventListener("pagehide", checkpoint);
      document.removeEventListener("visibilitychange", onVisibility);
      flush = () => {};
    };
  });
  return { flush: () => flush() };
}
