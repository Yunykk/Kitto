<script lang="ts">
  import type { CoverStatus } from "../types";
  import CoverArtwork from "./CoverArtwork.svelte";

  let { coverUrl, coverStatus, isPlaying = false }: {
    coverUrl: string | null;
    coverStatus: CoverStatus;
    isPlaying?: boolean;
  } = $props();
</script>

<div class="record-artwork" aria-hidden="true">
  <div class="orbit-vinyl" class:spinning={isPlaying}>
    <span class="vinyl-grooves"></span>
    <div class="vinyl-label" data-cover-status={coverStatus}>
      <CoverArtwork {coverUrl} {coverStatus} fallback="accent" />
      <span class="vinyl-spindle"></span>
    </div>
  </div>
</div>

<style>
  .record-artwork { position: relative; width: min(94cqw, 94cqh, 490px); aspect-ratio: 1; }
  .orbit-vinyl {
    position: absolute; inset: 0; display: grid; place-items: center;
    overflow: hidden; border: 1px solid #07090a; border-radius: 50%;
    background: conic-gradient(from 35deg, #0c0e10, #34393e 15%, #101315 27%, #0a0d0f 43%, #3a4147 53%, #111518 67%, #07090b 86%, #0c0e10);
    box-shadow: inset 0 0 0 2px #ffffff13, inset 0 0 0 9px #0005, 0 8px 18px #0003;
    animation: vinyl-spin 18s linear infinite paused;
  }
  .orbit-vinyl.spinning { animation-play-state: running; }
  .vinyl-grooves { position: absolute; inset: 4%; border-radius: 50%; background: repeating-radial-gradient(circle, transparent 0 2px, #d4dbe21a 2.5px, transparent 3px 4px); }
  .vinyl-grooves::after { position: absolute; inset: 21%; border: 1px solid #ffffff18; border-radius: 50%; box-shadow: 0 0 0 5px #ffffff03, 0 0 0 8px #ffffff08; content: ""; }
  .vinyl-label { position: relative; width: 34%; aspect-ratio: 1; overflow: hidden; border-radius: 50%; box-shadow: 0 0 0 4px #030405, 0 0 0 5px #ffffff16; }
  .vinyl-spindle { position: absolute; inset: 47%; border: 1px solid #ffffff60; border-radius: 50%; background: #111416; box-shadow: 0 0 0 2px #0003; }
  @keyframes vinyl-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .orbit-vinyl { animation: none; } }
</style>
