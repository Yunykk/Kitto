import { onDestroy } from "svelte";
import { createArtworkCache, type CachedArtwork } from "./artwork-cache";
import { readTrackMetadata } from "./metadata";
import type { CoverStatus, TrackTags } from "./types";

type TrackMetadata = TrackTags & { coverUrl: string | null };

export function createTrackMetadata(
  getPath: () => string | null,
  getPrefetchPath: () => string | null = () => null,
) {
  const cache = createArtworkCache({ readMetadata: readTrackMetadata });
  let data = $state<TrackMetadata | null>(null);
  let isLoading = $state(false);
  let error = $state("");
  let coverStatus = $state<CoverStatus>("missing");
  let activePath = $state<string | null>(null);

  onDestroy(() => cache.dispose());

  $effect(() => {
    const path = getPath();
    activePath = path;
    data = null;
    error = "";
    isLoading = path !== null;
    coverStatus = path === null ? "missing" : "loading";
    if (path === null) return;

    const lease = cache.acquire(path);
    let cancelled = false;

    function publish(result: CachedArtwork) {
      if (cancelled || getPath() !== path) return;
      data = {
        title: result.title,
        artist: result.artist,
        album: result.album,
        coverUrl: result.coverUrl,
      };
      coverStatus = result.coverStatus;
      error = result.error;
      isLoading = false;
    }

    if (lease.result !== null) {
      publish(lease.result);
    } else {
      void lease.promise.then(publish).catch(() => {
        if (cancelled || getPath() !== path) return;
        coverStatus = "error";
        error = "Metadata unavailable";
        isLoading = false;
      });
    }

    return () => {
      cancelled = true;
      lease.release();
    };
  });

  $effect(() => {
    const path = getPath();
    const next = getPrefetchPath();
    if (isLoading || path === null || next === null || next === path) return;

    const lease = cache.acquire(next);
    void lease.promise.finally(lease.release).catch(() => {});
    return lease.release;
  });

  return {
    get data() { return activePath === getPath() ? data : null; },
    get isLoading() {
      const path = getPath();
      return path !== null && (activePath !== path || isLoading);
    },
    get coverStatus(): CoverStatus {
      const path = getPath();
      if (path === null) return "missing";
      return activePath === path ? coverStatus : "loading";
    },
    get error() { return activePath === getPath() ? error : ""; },
  };
}
