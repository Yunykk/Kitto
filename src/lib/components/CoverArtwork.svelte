<script lang="ts">
  import type { CoverStatus } from "../types";

  let { coverUrl, coverStatus, fallback = "note" }: {
    coverUrl: string | null;
    coverStatus: CoverStatus;
    fallback?: "note" | "accent";
  } = $props();

  let failedUrl = $state<string | null>(null);
  const status = $derived(
    coverStatus === "ready" && (!coverUrl || coverUrl === failedUrl)
      ? "error" : coverStatus,
  );
</script>

<div class="cover-artwork" data-cover-status={status} data-fallback={fallback} aria-hidden="true">
  {#if status === "ready" && coverUrl}
    <img src={coverUrl} alt="" onerror={() => failedUrl = coverUrl} />
  {:else if status !== "loading" && fallback === "note"}
    <svg class="cover-placeholder" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 34V13l17-4v21M20 19l17-4" />
      <ellipse cx="15" cy="34" rx="5" ry="4" />
      <ellipse cx="32" cy="30" rx="5" ry="4" />
    </svg>
  {/if}
</div>

<style>
  .cover-artwork { display: grid; place-items: center; width: 100%; height: 100%; overflow: hidden; color: var(--color-muted); background: var(--color-panel); }
  .cover-artwork[data-fallback="accent"]:not([data-cover-status="loading"]) { background: var(--color-accent); }
  img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .cover-placeholder { width: 25%; height: 25%; max-width: 64px; max-height: 64px; opacity: .6; }
</style>
