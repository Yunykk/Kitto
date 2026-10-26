<script lang="ts">

  type Props = {
    hasTrack: boolean;
    isPlaying: boolean;
    canPrevious: boolean;
    canNext: boolean;
    onprevious: () => void;
    onnext: () => void;
    ontoggle: () => void;
  };

  let {
    hasTrack,
    isPlaying,
    canPrevious,
    canNext,
    onprevious,
    onnext,
    ontoggle
    }: Props = $props();
</script>

<div class="playback-controls" role="group" aria-label="Playback controls">

  <button
    class="transport-button"
    type="button"
    aria-label="Previous track"
    title="Previous track (Ctrl+Left)"
    disabled={!canPrevious}
    onclick={onprevious}
  >
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 5h2v14H6zM18 5.5v13a.5.5 0 0 1-.8.4l-8.1-6.5a.5.5 0 0 1 0-.8l8.1-6.5a.5.5 0 0 1 .8.4Z" />
    </svg>
  </button>

  <button
    class="transport-button transport-button--primary"
    type="button"
    aria-label={isPlaying ? "Pause" : "Play"}
    title={hasTrack
      ? (isPlaying ? "Pause (Space)" : "Play (Play)") 
      : "Add sum music to start"}
    disabled={!hasTrack}
    onclick={ontoggle}
  >
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {#if isPlaying}
        <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
      {:else}
        <path d="M8 4.8v14.4a.8.8 0 0 0 1.2.7l11-7.2a.8.8 0 0 0 0-1.4l-11-7.2a.8.8 0 0 0-1.2.7Z" />
      {/if}
    </svg>
  </button>

  <button
    class="transport-button"
    type="button"
    aria-label="Next track"
    title="Next track (Ctrl + Right)"
    disabled={!canNext}
    onclick={onnext}
  >
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16 5h2v14h-2zM6 5.5v13a.5.5 0 0 0 .8.4l8.1-6.5a.5.5 0 0 0 0-.8L6.8 5.1a.5.5 0 0 0-.8.4Z" />
    </svg>
  </button>
</div>
