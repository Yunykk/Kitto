<script lang="ts">
  import type { Track } from "../types";
  import {
    loadAudio,
    playAudio,
    pauseAudio,
    onAudioEnded,
    setVolume,
    onAudioProgress,
    seekTo
  } from "../audio";
  import { onMount } from "svelte";

  let currentTrack = $state<Track | null>(null);
  let playbackError = $state("")
  let isPlaying = $state(false);
  let volume = $state(1);
  let currentTime = $state(0);
  let duration = $state(0);
  
  let isSeeking = $state(false);
  let seekTime = $state(0);
  let seekChanged = $state(false);

  let displayTime = $derived(isSeeking ? seekTime : currentTime);

  let progress = $derived(
    duration > 0 ? Math.min(1, displayTime / duration) : 0
  );
  

  onMount(() => {
    const unsubscribeEnded = onAudioEnded(() => {
      isPlaying = false;
    });

    const unsubscribeProgress = onAudioProgress((value) => {
      currentTime = value.currentTime;
      duration = value.duration;
    });

    return () => {
      unsubscribeEnded();
      unsubscribeProgress();
    };
  });

  function handleFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    loadAudio(file);
    cancelSeek();
    seekTime = 0;
    currentTime = 0;
    duration = 0;
    currentTime = 0;
    duration = 0;
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

  function handleVolumeChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;

    volume = input.valueAsNumber;
    setVolume(volume);
  }


  function formatTime(seconds: number) {
    const totalSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(totalSeconds / 60);
    const remainder = totalSeconds % 60;

    return `${minutes}:${remainder.toString().padStart(2, "0")}`;
  }

  function startSeeking(event: PointerEvent) {
    const input = event.currentTarget as HTMLInputElement;

    seekTime = input.valueAsNumber;
    seekChanged = false;
    isSeeking = true;
  }

  function previewSeek(event: Event) {
    const input = event.currentTarget as HTMLInputElement;

    seekTime = input.valueAsNumber;
    seekChanged = true;
    isSeeking = true;
  }

  function commitSeek() {
    if (!isSeeking) return;

    if (seekChanged) {
      seekTo(seekTime);
      currentTime = seekTime;
    }

    isSeeking = false;
    seekChanged = false;
  }

  function cancelSeek() {
    isSeeking = false;
    seekChanged = false;
  }
</script>

<svelte:window
  onpointerup={commitSeek}
  onpointercancel={cancelSeek}
  onblur={cancelSeek}
/>

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
        stroke-dasharray={`${progress * 100} 100`}
        transform="rotate(-90 200 200)"
      />
      <g transform={`rotate(${progress * 360} 200 200)`}>
        <circle cx ="200" cy="10" r="5" fill="var(--color-accent)" />
      </g>
    </svg>
    <div class="record">
      <span class="record-center"></span>
    </div>
  </div>

  <h2 id="library-heading">
    {currentTrack?.title ?? "Your library is empty"}
  </h2>
  <p class="empty-description">Your local tracks will appear here.</p>

  <div class="timeline">
    <span>{formatTime(displayTime)}</span>

    <input
      type="range"
      min="0"
      max={duration || 1}
      step="0.1"
      value={displayTime}
      disabled={!currentTrack || duration <= 0}
      aria-label="Playback position"
      aria-valuetext={`${formatTime(displayTime)} of ${formatTime(duration)}`}
      onpointerdown={startSeeking}
      oninput={previewSeek}
      onchange={commitSeek}
      onblur={cancelSeek}
    />

    <span>{formatTime(duration)}</span>
  </div>

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
  
  <div class="volume-control">
    <label for="volume">Volume</label>
    <input
      id="volume"
      type="range"
      min="0"
      max="1"
      step="0.01"
      value={volume}
      oninput={handleVolumeChange}
    />
    <output for="volume">{Math.round(volume * 100)}%</output>
  </div>

  {#if playbackError}
    <p role="alert">{playbackError}</p>
  {/if}
</section>
