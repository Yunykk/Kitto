<script lang="ts">
  import type { RepeatMode } from "../settings";

  type Props = {
    isShuffling: boolean;
    repeatMode: RepeatMode;
    volume: number;
    onshuffle: () => void;
    onrepeat: () => void;
    onvolumechange: (event: Event) => void;
  };

  let { isShuffling, repeatMode, volume, onshuffle, onrepeat, onvolumechange }: Props = $props();

  const repeatLabels = {
    off: "Repeat off",
    all: "Repeat all",
    one: "Repeat one",
  };
</script>

<div class="player-options">
  <div class="playback-modes">
    <button
      class="mode-button"
      class:active={isShuffling}
      type="button"
      aria-label={isShuffling ? "Shuffle on" : "Shuffle off"}
      aria-pressed={isShuffling}
      title={isShuffling ? "Shuffle on" : "Shuffle off"}
      onclick={onshuffle}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 7h3c5 0 7 10 12 10h3m-4-4 4 4-4 4M3 17h3c2 0 3-2 5-5m3-3c1-1 2-2 4-2h3m-4-4 4 4-4 4" />
      </svg>
      <span>Shuffle</span>
    </button>

    <button
      class="mode-button"
      class:active={repeatMode !== "off"}
      type="button"
      aria-label={repeatLabels[repeatMode]}
      aria-pressed={repeatMode !== "off"}
      title={repeatLabels[repeatMode]}
      onclick={onrepeat}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3" />
      </svg>
      <span>{repeatLabels[repeatMode]}</span>
    </button>
  </div>

  <div class="volume-control">
    <label class="sr-only" for="volume">Volume</label>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
    </svg>
    <input
      id="volume"
      type="range"
      min="0"
      max="1"
      step="0.01"
      value={volume}
      style:--range-progress={`${volume * 100}%`}
      oninput={onvolumechange}
    />
    <output for="volume">{Math.round(volume * 100)}%</output>
  </div>
</div>
