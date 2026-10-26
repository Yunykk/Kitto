<script lang="ts">
  import { createPlayer } from "../player.svelte";
  import AddMusicButton from "./AddMusicButton.svelte";
  import RecordArtwork from "./RecordArtwork.svelte";
  import PlaybackTimeline from "./PlaybackTimeline.svelte";
  import PlaybackControls from "./PlaybackControls.svelte";
  import PlayerOptions from "./PlayerOptions.svelte";
  import TrackList from "./TrackList.svelte";
  import { createTrackMetadata } from "../track-metadata.svelte";
  import TrackDetails from "./TrackDetails.svelte";
  import { createMediaSession } from "../media-session.svelte";
  import { createQueueMetadata } from "../queue-metadata.svelte";


  const player = createPlayer();
  const queueMetadata = createQueueMetadata(
    () => player.tracks,
  );
  const trackMetadata = createTrackMetadata(
    () => player.currentTrack?.path ?? null,
  );
  const currentTags = $derived(
    trackMetadata.data ?? queueMetadata.tracks[player.currentIndex] ?? null,
  );
  const displayTitle = $derived(
    currentTags?.title ??
    player.currentTrack?.title ??
    "Your library is empty",
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
      <button type="button" aria-label="Show queue" aria-pressed={view === "queue"} onclick={() => view = "queue"}>
        Queue <span class="view-count">{player.tracks.length}</span>
      </button>
    </div>
    <AddMusicButton isChoosingFiles={player.isChoosingFiles} onadd={player.chooseFiles} />
  </div>

  <section class="now-playing" aria-labelledby="track-heading">
    <div class="record-stage">
      <RecordArtwork progress={player.progress} />
    </div>

    <div class="player-deck">
      <TrackDetails
        title={displayTitle}
        artist={currentTags?.artist ?? null}
        album={currentTags?.album ?? null}
        coverUrl={trackMetadata.data?.coverUrl ?? null}
        isLoading={trackMetadata.isLoading}
        error={trackMetadata.error}
        status={player.currentTrack
          ? `${player.isPlaying ? "Playing" : "Paused"} · Track ${player.currentIndex + 1} of ${player.tracks.length}`
          : "Add music to start listening"}
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
    </div>
  </section>

  <TrackList
    tracks={queueMetadata.tracks}
    isIndexing={queueMetadata.isIndexing}
    metadataError={queueMetadata.error}
    currentIndex={player.currentIndex}
    isChoosingFiles={player.isChoosingFiles}
    onadd={player.chooseFiles}
    onselect={player.playTrack}
    onremove={player.removeTrack}
    onclear={player.clearLibrary}
  />

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
