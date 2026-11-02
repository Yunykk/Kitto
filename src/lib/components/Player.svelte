<script lang="ts">
  import { createPlayer } from "../player.svelte";
  import { createPlaylists } from "../playlists.svelte";
  import AddMusicButton from "./AddMusicButton.svelte";
  import PlayerArtwork from "./PlayerArtwork.svelte";
  import type { ThemeId } from "../appearance";
  import PlaybackTimeline from "./PlaybackTimeline.svelte";
  import PlaybackControls from "./PlaybackControls.svelte";
  import PlayerOptions from "./PlayerOptions.svelte";
  import TrackList from "./TrackList.svelte";
  import { createTrackMetadata } from "../track-metadata.svelte";
  import TrackDetails from "./TrackDetails.svelte";
  import { createMediaSession } from "../media-session.svelte";
  import { createQueueMetadata } from "../queue-metadata.svelte";
  import type { FavoritesController } from "../favorites.svelte";

  let {
    theme = "orbit",
    favorites,
  } : {
    theme?: ThemeId;
    favorites: FavoritesController;
  } = $props();


  const player = createPlayer();
  const collections = createPlaylists(() => player.isReady ? player.library.map((track) => track.id) : null);
  $effect(() => {
    if (!player.isReady || !favorites.isReady) return;

    favorites.prune(
      player.library.map((track) => track.id),
    );
  });

  const libraryMetadata = createQueueMetadata(
    () => player.library,
  );
  const trackMetadata = createTrackMetadata(
    () => player.currentTrack?.path ?? null,
    () => player.isShuffling || player.currentIndex < 0
      ? null
      : player.tracks[player.currentIndex + 1]?.path ?? null,
  );
  const currentTags = $derived(
    trackMetadata.data ?? libraryMetadata.tracks.find((track) => track.id === player.currentTrack?.id) ?? null,
  );
  const displayTitle = $derived(
    currentTags?.title ??
    player.currentTrack?.title ??
    (player.library.length > 0 ? "No track selected" : "Your library is empty"),
  );

  createMediaSession(
    {
      get hasTrack() {
        return player.currentTrack !== null;
      },

      get title() {
        return displayTitle;
      },

      get artist() {
        return currentTags?.artist ?? null;
      },

      get album() {
        return currentTags?.album ?? null;
      },

      get coverUrl() {
        return trackMetadata.data?.coverUrl ?? null;
      },

      get isPlaying() {
        return player.isPlaying;
      },

      get canPrevious() {
        return player.canPrevious;
      },

      get canNext() {
        return player.canNext;
      },
    },

    player,

  );


  let view = $state<"player" | "queue">("player");
</script>

<div class="player" data-view={view}>
  <div class="player-toolbar">
    <div class="view-switch" role="group" aria-label="Player view">
      <button type="button" aria-label="Show player" aria-pressed={view === "player"} onclick={() => view = "player"}>
        Player
      </button>
      <button type="button" aria-label="Show library" aria-pressed={view === "queue"} onclick={() => view = "queue"}>
        Library <span class="view-count">{player.library.length}</span>
      </button>
    </div>
    <AddMusicButton isChoosingFiles={player.isChoosingFiles} onadd={player.chooseFiles} />
  </div>

  <TrackList
    tracks={libraryMetadata.tracks}
    queue={player.tracks}
    queueName={player.queueName}
    currentId={player.currentTrack?.id ?? null}
    isPlaying={player.isPlaying}
    isIndexing={libraryMetadata.isIndexing}
    metadataError={libraryMetadata.error}
    isChoosingFiles={player.isChoosingFiles}
    {collections}
    {favorites}
    onadd={player.chooseFiles}
    onfiles={player.choosePlaylistFiles}
    onselect={player.playLibraryTrack}
    onqueueselect={player.playTrack}
    onplayplaylist={player.playCollection}
    onremove={player.removeTrack}
    onremovequeue={player.removeFromQueue}
    onclear={player.clearLibrary}
    onclearqueue={player.clearQueue}
  />

  <section class="now-playing" aria-labelledby="track-heading">
    <div class="record-stage">
      <PlayerArtwork
        {theme}
        title={displayTitle}
        coverUrl={trackMetadata.data?.coverUrl ?? null}
        coverStatus={trackMetadata.coverStatus}
        isPlaying={player.isPlaying}
      />
    </div>

    <div class="player-deck">
      <TrackDetails
        title={displayTitle}
        isFavorite={favorites.has(player.currentTrack?.id ?? "")}
        canFavorite={favorites.isReady && player.currentTrack !== null}
        onfavorite={() => {
          const id = player.currentTrack?.id;
          if (id) favorites.toggle(id);
        }}
        artist={currentTags?.artist ?? null}
        album={currentTags?.album ?? null}
        coverUrl={trackMetadata.data?.coverUrl ?? null}
        coverStatus={trackMetadata.coverStatus}
        showCover={theme === "tape-deck" && player.currentTrack !== null}
        isLoading={trackMetadata.isLoading}
        error={trackMetadata.error}
        status={player.currentTrack
          ? `${player.isPlaying ? "Playing" : "Paused"} · Track ${player.currentIndex + 1} of ${player.tracks.length}`
          : player.library.length > 0 ? "Choose a track or playlist" : "Add music to start listening"}
      />
      <PlaybackTimeline
        time={player.displayTime}
        duration={player.duration}
        disabled={!player.currentTrack || player.duration <= 0}
        onstart={player.startSeeking}
        onpreview={player.previewSeek}
        oncommit={player.commitSeek}
        oncancel={player.cancelSeek}
      />

      <PlaybackControls
        hasTrack={player.currentTrack !== null}
        isPlaying={player.isPlaying}
        canPrevious={player.canPrevious}
        canNext={player.canNext}
        onprevious={player.previousTrack}
        onnext={player.nextTrack}
        ontoggle={player.togglePlayback}
      />

      <PlayerOptions
        isShuffling={player.isShuffling}
        repeatMode={player.repeatMode}
        volume={player.volume}
        onshuffle={player.toggleShuffle}
        onrepeat={player.cycleRepeat}
        onvolumechange={player.handleVolumeChange}
      />

      {#if player.playbackError}
        <p class="playback-error" role="alert" title={player.playbackError}>{player.playbackError}</p>
      {/if}

      {#if favorites.error}
          <p class="playback-error" role="alert">
            {favorites.error}
          </p>
      {/if}
    </div>
  </section>

  <div class="queue-player" style:--progress={`${player.progress * 100}%`}>
    <div class="queue-track-info">
      <span>{player.isPlaying ? "Now playing" : "Paused"}</span>
      <p title={displayTitle}>{player.currentTrack ? displayTitle : "No track selected"}</p>
      {#if player.playbackError}
        <p class="queue-player-error" role="alert" title={player.playbackError}>{player.playbackError}</p>
      {/if}
    </div>
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
