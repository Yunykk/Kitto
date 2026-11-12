<script lang="ts">
  import CoverArtwork from "./CoverArtwork.svelte";
  import FavoritesButton from "./FavoritesButton.svelte";
  import PlaybackControls from "./PlaybackControls.svelte";
  import PlaybackTimeline from "./PlaybackTimeline.svelte";

  import type { PlayController } from "../player.svelte";
  import type { FavoritesController } from "../favorites.svelte";
  import type { MiniPlayerWindowController } from "../mini-player-window.svelte";
  import type { CoverStatus } from "../types";

  let {
    player,
    favorites,
    windowController,
    title,
    artist,
    coverUrl,
    coverStatus,
  }: {
    player: PlayController;
    favorites: FavoritesController;
    windowController: MiniPlayerWindowController;
    title: string;
    artist: string | null;
    coverUrl: string | null;
    coverStatus: CoverStatus;
  } = $props();

  const subtitle = $derived(
    artist ?? (player.currentTrack ? "" : "Open full player to add music"),
  );

  const error = $derived(
    windowController.error || player.playbackError || favorites.error,
  );

  function toggleFavorite(): void {
    const id = player.currentTrack?.id;

    if (id) favorites.toggle(id);
  }
</script>

<article class="mini-player" aria-labelledby="mini-track-heading">
  <header class="mini-toolbar">
    <img src="/kitto.svg" width="24" height="24" alt="Kitto" />

    <div class="mini-window-actions">
      <button
        class="mini-window-button"
        class:active={windowController.isPinned}
        type="button"
        aria-label="Always on top"
        aria-pressed={windowController.isPinned}
        title="Always on top"
        disabled={windowController.isBusy}
        onclick={() => void windowController.togglePin()}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m16 3 5 5-4 1-3 5v3l-3-3-5 3 1-4 5-3 1-4z" />
          <path d="m3 21 5-5" />
        </svg>
      </button>
      <button
        class="mini-window-button"
        type="button"
        aria-label="Return to full player"
        title="Return to full player"
        disabled={windowController.isBusy}
        onclick={() => void windowController.leave()}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />
          <path d="m3 3 6 6m12-6-6 6M3 21l6-6m12 6-6-6" />
        </svg>
      </button>
    </div>
  </header>

  <div class="mini-art">
    <CoverArtwork {coverUrl} {coverStatus} />
  </div>

  <div class="mini-deck">
    <div class="mini-details">
      <div class="mini-title-row">
        <h2 id="mini-track-heading" {title}>
          {title}
        </h2>

        <FavoritesButton
          liked={favorites.has(player.currentTrack?.id ?? "")}
          disabled={!favorites.isReady || player.currentTrack === null}
          ontoggle={toggleFavorite}
        />
      </div>
      {#if subtitle}
        <p class="mini-artist" title={subtitle}>{subtitle}</p>
      {/if}
    </div>
    <div class="mini-controls">
      <PlaybackControls
        hasTrack={player.currentTrack !== null}
        isPlaying={player.isPlaying}
        canPrevious={player.canPrevious}
        canNext={player.canNext}
        onprevious={player.previousTrack}
        onnext={player.nextTrack}
        ontoggle={player.togglePlayback}
      />
    </div>
  </div>

  <div class="mini-timeline">
    <PlaybackTimeline
      time={player.displayTime}
      duration={player.duration}
      disabled={player.currentTrack === null || player.duration <= 0}
      onstart={player.startSeeking}
      onpreview={player.previewSeek}
      oncommit={player.commitSeek}
      oncancel={player.cancelSeek}
    />
  </div>

  {#if error}
    <p class="mini-error" role="alert">{error}</p>
  {/if}
</article>
