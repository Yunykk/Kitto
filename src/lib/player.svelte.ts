import { onMount } from "svelte";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { QueueTrack } from "./types";
import { registeredPlayerShortcuts } from "./shortcuts";
import {
  loadSettings,
  saveSettings,
  type RepeatMode,
} from "./settings";
import { pickTracks, loadLibrary, saveLibrary } from "./library";
import {
  loadAudio,
  unloadAudio,
  playAudio,
  pauseAudio,
  setVolume,
  seekTo,
  getAudioProgress,
  onAudioProgress,
  onAudioEnded,
  onAudioError,
} from "./audio";
import { createPlaybackOrder } from "./playback-order.svelte";
import { register } from "module";

export function createPlayer() {
  let tracks = $state<QueueTrack[]>([]);

  const order = createPlaybackOrder(
    () => tracks.map((track) => track.id),
  );

  let currentIndex = $derived(
    tracks.findIndex((track) => track.id === order.currentId),
  );

  let currentTrack = $derived<QueueTrack | null>(
    tracks[currentIndex] ?? null,
  );

  let playbackError = $state("");
  let storageError = $state("");
  let isPlaying = $state(false);
  let isChoosingFiles = $state(false);
  let volume = $state(1);
  let repeatMode = $state<RepeatMode>("off");

  let currentTime = $state(0);
  let duration = $state(0);
  let isSeeking = $state(false);
  let seekTime = $state(0);
  let seekChanged = $state(false);

  let displayTime = $derived(isSeeking ? seekTime : currentTime);

  let progress = $derived(
    duration > 0 ? Math.min(1, displayTime / duration) : 0,
  );

  let playbackRequestId = 0;
  let lastSavedAt = 0;
  let disposed = false;
  let libraryReady = false;

  function persistSettings() {
    saveSettings({
      volume,
      repeatMode,
      shuffle: order.shuffle,
    });
  }

  function persistLibrary() {
    if (!isTauri() || !libraryReady) return;

    const saved = saveLibrary({
      tracks,
      currentTrackId: currentTrack?.id ?? null,
      position: currentTrack ? getAudioProgress().currentTime : 0,
    });

    storageError = saved ? "" : "Could not save your library.";
    lastSavedAt = performance.now();
  }

  async function chooseFiles() {
    if (isChoosingFiles) return;

    isChoosingFiles = true;
    playbackError = "";

    try {
      const selected = await pickTracks();

      if (disposed || selected.length === 0) return;

      const existingPaths = new Set(tracks.map((track) => track.path));
      const added = selected.filter(
        (track) => !existingPaths.has(track.path),
      );

      if (added.length === 0) return;

      tracks = [...tracks, ...added];

      if (currentIndex < 0) {
        selectTrack(0);
      } else {
        persistLibrary();
      }
    } catch (error) {
      if (!disposed) {
        playbackError =
          error instanceof Error
            ? error.message
            : "Could not choose audio files.";
      }
    } finally {
      isChoosingFiles = false;
    }
  }

  function selectTrack(
    index: number,
    autoplay = false,
    position = 0,
  ) {
    const track = tracks[index];

    if (!track) return;

    playbackRequestId += 1;
    cancelSeek();

    order.select(track.id);
    currentTime = position;
    seekTime = position;
    duration = 0;
    isPlaying = false;
    playbackError = "";

    loadAudio(track.path, position);
    persistLibrary();

    if (autoplay) {
      void startPlayback();
    }
  }

  async function startPlayback() {
    if (!currentTrack) return;

    const requestId = ++playbackRequestId;
    playbackError = "";

    try {
      await playAudio();

      if (requestId === playbackRequestId) {
        isPlaying = true;
      }
    } catch {
      if (requestId === playbackRequestId) {
        isPlaying = false;
        playbackError = "Could not play this file.";
      }
    }
  }

  function playTrack(index: number) {
    const track = tracks[index];

    if (!track) return;

    order.select(track.id, true);
    selectTrack(index, true);
  }

  function togglePlayback() {
    if (!currentTrack) return;

    if (isPlaying) {
      playbackRequestId += 1;
      pauseAudio();
      isPlaying = false;
      persistLibrary();
      return;
    }

    void startPlayback();
  }

  function handleVolumeChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;

    volume = input.valueAsNumber;
    setVolume(volume);
    persistSettings();
  }

  function cycleRepeat() {
    if (repeatMode === "off") {
      repeatMode = "all";
    } else if (repeatMode === "all") {
      repeatMode = "one";
    } else {
      repeatMode = "off";
    }

    order.finishCycle(repeatMode === "all");
    persistSettings();
  }

  function toggleShuffle() {
    order.setShuffle(!order.shuffle);
    persistSettings();
  }

  function navigate(direction: "next" | "previous") {
    const repeatAll = repeatMode === "all";

    const id =
      direction === "next"
        ? order.next(repeatAll)
        : order.previous(repeatAll);

    persistSettings();

    if (id === null) {
      persistLibrary();
      return;
    }

    const index = tracks.findIndex((track) => track.id === id);
    selectTrack(index, true);
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
      persistLibrary();
    }

    cancelSeek();
  }

  function cancelSeek() {
    isSeeking = false;
    seekChanged = false;
  }

  function clearLibrary() {
    playbackRequestId += 1;
    cancelSeek();

    tracks = [];
    order.clear();
    currentTime = 0;
    seekTime = 0;
    duration = 0;
    isPlaying = false;
    playbackError = "";

    unloadAudio();
    persistLibrary();
  }

  function removeTrack(id: string) {
    const removedIndex = tracks.findIndex((track) => track.id === id);

    if (removedIndex < 0) return;

    const selectedId = currentTrack?.id;
    const continuePlaying = isPlaying;

    tracks = tracks.filter((track) => track.id !== id);

    if (tracks.length === 0) {
      clearLibrary();
      return;
    }

    if (id === selectedId) {
      const nextIndex = Math.min(removedIndex, tracks.length - 1);
      selectTrack(nextIndex, continuePlaying);
    } else {
      persistLibrary();
    }

    order.finishCycle(repeatMode === "all");
    persistSettings();
  }

  function seekBy(seconds: number) {
    if (!currentTrack || duration <= 0) return;

    cancelSeek();
    seekTo(getAudioProgress().currentTime + seconds);
    currentTime = getAudioProgress().currentTime;
    persistLibrary();
  }

  function adjustVolume(delta: number) {
    volume = Math.round(
      Math.max(0, Math.min(1, volume + delta)) * 100,
    ) / 100;

    setVolume(volume);
    persistSettings();
  }

  onMount(() => {
    disposed = false;

    const settings = loadSettings();
    volume = settings.volume;
    repeatMode = settings.repeatMode;
    order.setShuffle(settings.shuffle);
    setVolume(volume);

    const unsubscribeProgress = onAudioProgress((value) => {
      currentTime = value.currentTime;
      duration = value.duration;

      if (performance.now() - lastSavedAt >= 1500) {
        persistLibrary();
      }
    });

    const unsubscribeEnded = onAudioEnded(() => {
      if (!isPlaying) return;

      isPlaying = false;

      if (repeatMode === "one") {
        seekTo(0);
        currentTime = 0;
        persistLibrary();
        void startPlayback();
        return;
      }

      navigate("next");
    });

    const unsubscribeError = onAudioError(() => {
      playbackRequestId += 1;
      isPlaying = false;
      playbackError =
        "Could not open this file. It may be missing or unsupported.";
    });

    let removeCloseListener: (() => void) | undefined;

    if (isTauri()) {
      const saved = loadLibrary();
      tracks = saved.tracks;
      libraryReady = true;

      const savedIndex = tracks.findIndex(
        (track) => track.id === saved.currentTrackId,
      );

      if (tracks.length > 0) {
        selectTrack(
          savedIndex >= 0 ? savedIndex : 0,
          false,
          savedIndex >= 0 ? saved.position : 0,
        );
      }

      void getCurrentWindow()
        .onCloseRequested(() => persistLibrary())
        .then((unlisten) => {
          if (disposed) {
            unlisten();
          } else {
            removeCloseListener = unlisten;
          }
        })
        .catch((error) => {
          console.error("Could not register close handler.", error);
        });
    }

    const removeShortcuts = registeredPlayerShortcuts({
      togglePlayback,

      nextTrack: () => {
        navigate("next");
      },

      previousTrack: () => {
        if (order.canPrevious(repeatMode === "all")) {
          navigate("previous");
        }
      },
      seekBy,
      adjustVolume,
    });

    window.addEventListener("pagehide", persistLibrary);

    return () => {
      disposed = true;
      persistLibrary();
      playbackRequestId += 1;

      window.removeEventListener("pagehide", persistLibrary);
      removeShortcuts();
      removeCloseListener?.();
      unsubscribeProgress();
      unsubscribeEnded();
      unsubscribeError();
      unloadAudio();
    };
  });

  return {
    get tracks() { return tracks; },
    get currentIndex() { return currentIndex; },
    get currentTrack() { return currentTrack; },
    get playbackError() { return playbackError || storageError; },
    get isPlaying() { return isPlaying; },
    get isChoosingFiles() { return isChoosingFiles; },
    get volume() { return volume; },
    get repeatMode() { return repeatMode; },
    get duration() { return duration; },
    get displayTime() { return displayTime; },
    get progress() { return progress; },
    get isShuffling() { return order.shuffle; },
    get canNext() { return order.canNext(repeatMode === "all"); },
    get canPrevious() { return order.canPrevious(repeatMode === "all"); },
    toggleShuffle,
    nextTrack: () => navigate("next"),
    previousTrack: () => navigate("previous"),
    chooseFiles,
    selectTrack,
    playTrack,
    removeTrack,
    clearLibrary,
    togglePlayback,
    handleVolumeChange,
    cycleRepeat,
    startSeeking,
    previewSeek,
    commitSeek,
    cancelSeek,
  };
}
