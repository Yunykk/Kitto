<script lang="ts">
  import { createPlayer } from "../player.svelte";
  import RecordArtwork from "./RecordArtwork.svelte";
  import PlaybackTimeline from "./PlaybackTimeline.svelte";
  import PlaybackControls from "./PlaybackControls.svelte";
  import TrackList from "./TrackList.svelte";

  const player = createPlayer();

  const repeatLabels = {
    off : "Repeat off",
    all : "Repeat all",
    one : "Repeat one"
  };
</script>

<section class="player" aria-labelledby="track-heading">
  <RecordArtwork progress={player.progress} />

  <h2 id="track-heading">
    {player.currentTrack?.title ?? "Your library is empty"}
  </h2>
  <p class="track-description">
    {player.currentTrack
      ? `${player.currentIndex + 1} / ${player.tracks.length}`
      : "Choose audio files to get started."}
  </p>

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
    isChoosingFiles={player.isChoosingFiles}
    canPrevious={player.canPrevious}
    canNext={player.canNext}
    onfiles={player.chooseFiles}
    onprevious={player.previousTrack}
    onnext={player.nextTrack}
    ontoggle={player.togglePlayback}
  />

  <div class="playback-modes">
    <button
      class="repeat-button"
      class:active={player.isShuffling}
      type="button"
      aria-pressed={player.isShuffling}
      onclick={player.toggleShuffle}
    >
      Shuffle {player.isShuffling ? "on" : "off"}
    </button>

    <button
      class="repeat-button"
      class:active={player.repeatMode !== "off"}
      type="button"
      aria-pressed={player.repeatMode !== "off"}
      onclick={player.cycleRepeat}
    >
      {repeatLabels[player.repeatMode]}
    </button>
  </div>

  <div class="volume-control">
    <label for="volume">Volume</label>
    <input
      id="volume"
      type="range"
      min="0"
      max="1"
      step="0.01"
      value={player.volume}
      oninput={player.handleVolumeChange}
    />
    <output for="volume">{Math.round(player.volume * 100)}%</output>
  </div>

  <TrackList
    tracks={player.tracks}
    currentIndex={player.currentIndex}
    onselect={player.playTrack}
    onremove={player.removeTrack}
    onclear={player.clearLibrary}
  />

  {#if player.playbackError}
    <p role="alert">{player.playbackError}</p>
  {/if}
</section>
