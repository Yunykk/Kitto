<script lang="ts">
  import type { Track } from "../types";
  import {
    loadAudio,
    playAudio,
    pauseAudio,
    onAudioEnded,
  } from "../audio";
  import { onMount } from "svelte";

  let currentTrack = $state<Track | null>(null);
  let playbackError = $state("")
  let isPlaying = $state(false);

  onMount (() => {
    return onAudioEnded (() => {
      isPlaying = false;
    });
  });
  function handleFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    loadAudio(file);
    isPlaying = false
    playbackError = "";

    currentTrack = {
      id: crypto.randomUUID(),
      title: file.name,
    }


  }

  async function togglePlayback() {
    playbackError = "";

    if (isPlaying) {
      pauseAudio();
      isPlaying = false;
      return;
    }

    try {
      await playAudio();
      isPlaying = true;
    } catch {
      playbackError = "Could not play this file"
    }
  }
</script>


<section class="orbit-player" aria-labelledby="library-heading">
  <div class="orbit-artwork" aria-hidden="true">
    <svg class="orbit-ring" viewBox="0 0 400 400" fill="none">
      <circle cx="200" cy="200" r="190" stroke="var(--color-line)" />
      <circle
        cx="200"
        cy="200"
        r="190"
        stroke="var(--color-accent)"
        stroke-width="2.5"
        stroke-linecap="round"
        pathLength="100"
        stroke-dasharray="17 83"
        transform="rotate(-90 200 200)"
      />
      <circle cx="366.5" cy="108.5" r="5" fill="var(--color-accent)" />
    </svg>
    <div class="record">
      <span class="record-center"></span>
    </div>
  </div>

  <h2 id="library-heading">
    {currentTrack?.title ?? "Your library is empty"}
  </h2>
  <p class="empty-description">Your local tracks will appear here.</p>

  <div class="playback-controls" role="group" aria-label="Playback controls">
    <input
      type="file"
      accept="audio/*"
      aria-label="Choose an audio file"
      onchange={handleFileChange}
    />
    <button
      class="transport-button"
      type="button"
      aria-label="Previous track"
      title="Your library is empty"
      disabled
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M6 5h2v14H6zM18 5.5v13a.5.5 0 0 1-.8.4l-8.1-6.5a.5.5 0 0 1 0-.8l8.1-6.5a.5.5 0 0 1 .8.4Z" />
      </svg>
    </button>

    <button
      class="transport-button transport-button--primary"
      type="button"
      aria-label={isPlaying ? "Pause" : "Play"}
      title={currentTrack ? (isPlaying ? "Pause" : "Play") : "Choose an audio file first"}
      disabled={currentTrack === null}
      onclick={togglePlayback}
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
      title="Your library is empty"
      disabled
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M16 5h2v14h-2zM6 5.5v13a.5.5 0 0 0 .8.4l8.1-6.5a.5.5 0 0 0 0-.8L6.8 5.1a.5.5 0 0 0-.8.4Z" />
      </svg>
    </button>
  </div>

  {#if playbackError}
    <p role="alert">{playbackError}</p>
  {/if}
</section>
