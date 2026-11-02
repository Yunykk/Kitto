<script lang="ts">
  import { onMount } from "svelte";
  import { getLibraryArtwork } from "../library-artwork";
  import type { CachedArtwork } from "../artwork-cache";
  import CoverArtwork from "./CoverArtwork.svelte";
  let { path }: { path: string } = $props();
  const cache = getLibraryArtwork();
  let host: HTMLDivElement;
  let visible = $state(false);
  let activePath = $state("");
  let result = $state<CachedArtwork | null>(null);
  onMount(() => {
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    }, { rootMargin: "80px" });
    observer.observe(host);
    return () => observer.disconnect();
  });
  $effect(() => {
    const current = path;
    activePath = current;
    result = null;
    if (!visible) return;
    const lease = cache.acquire(current);
    let cancelled = false;
    result = lease.result;
    void lease.promise.then((value) => {
      if (!cancelled && path === current) result = value;
    }).catch(() => {});
    return () => { cancelled = true; lease.release(); };
  });
</script>
<div class="library-cover" bind:this={host}>
  <CoverArtwork
    coverUrl={activePath === path ? result?.coverUrl ?? null : null}
    coverStatus={activePath === path ? result?.coverStatus ?? "loading" : "loading"}
  />
</div>
<style>
  .library-cover { width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; }
</style>
