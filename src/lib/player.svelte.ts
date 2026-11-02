import { onMount } from "svelte";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { QueueTrack } from "./types";
import { registerPlayerShortcuts } from "./shortcuts";
import {
  loadSettings,
  saveSettings,
  type RepeatMode,
} from "./settings";
import { pickTracks, loadLibrary, saveLibrary, pathKey } from "./library";
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

export function createPlayer() {
  let library = $state<QueueTrack[]>([]);
  let tracks = $state<QueueTrack[]>([]);
  let queueName = $state("Music");
  let queueIsLibrary = $state(true);
  let isReady = $state(false);

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
  let isStarting = $state(false);
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
      tracks: library,
      queue: { trackIds: tracks.map((track) => track.id), name: queueName, isLibrary: queueIsLibrary },
      currentTrackId: currentTrack?.id ?? null,
      position: currentTrack ? getAudioProgress().currentTime : 0,
    });

    storageError = saved ? "" : "Could not save your library.";
    lastSavedAt = performance.now();
  }

  async function importFiles(appendToQueue: boolean): Promise<string[] | null> {
    if (isChoosingFiles || disposed) return [];
    if (isTauri() && !libraryReady) return null;
    isChoosingFiles = true;
    playbackError = "";

    try {
      const selected = await pickTracks();
      if (disposed || selected.length === 0) return [];

      const byPath = new Map(library.map((track) => [pathKey(track.path), track]));
      const added: QueueTrack[] = [];
      const imported: QueueTrack[] = [];
      for (const candidate of selected) {
        const key = pathKey(candidate.path);
        let track = byPath.get(key);
        if (!track) {
          track = { ...candidate, addedAt: candidate.addedAt ?? Date.now() };
          byPath.set(key, track);
          added.push(track);
        }
        imported.push(track);
      }

      if (added.length > 0) library = [...library, ...added];
      if (appendToQueue && (queueIsLibrary || tracks.length === 0)) {
        tracks = [...library];
        queueIsLibrary = true;
        queueName = "Music";
        if (currentIndex < 0 && tracks.length > 0) selectTrack(0);
      } else if (!appendToQueue && added.length > 0) {
        queueIsLibrary = false;
      }

      persistLibrary();
      return storageError ? null : [...new Set(imported.map((track) => track.id))];
    } catch (error) {
      if (!disposed) playbackError = error instanceof Error
        ? error.message : "Could not choose audio files.";
      return null;
    } finally {
      isChoosingFiles = false;
    }
  }

  function playCollection(
    ids: string[],
    name: string,
    startId: string | null = null,
    isLibrary = false,
  ): boolean {
    const byId = new Map(library.map((track) => [track.id, track]));
    const next = [...new Set(ids)].flatMap((id) => {
      const track = byId.get(id);
      return track ? [track] : [];
    });
    if (next.length === 0) return false;

    order.clear();
    tracks = next;
    queueName = name;
    queueIsLibrary = isLibrary;
    const index = Math.max(0, next.findIndex((track) => track.id === startId));
    order.select(next[index].id, true);
    selectTrack(index, true);
    return true;
  }

  function playLibraryTrack(id: string) {
    playCollection(library.map((track) => track.id), "Music", id, true);
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
    isStarting = false;
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
    isStarting = true;
    playbackError = "";

    try {
      await playAudio();

      if (requestId === playbackRequestId) {
        isPlaying = true;
        const id = currentTrack?.id;
        library = library.map((track) => track.id === id
          ? { ...track, lastPlayedAt: Date.now() } : track);
        persistLibrary();
      }
    } catch {
      if (requestId === playbackRequestId) {
        isPlaying = false;
        playbackError = "Could not play this file.";
      }
    } finally {
      if (requestId === playbackRequestId) {
        isStarting = false;
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

    if (isPlaying || isStarting) {
      playbackRequestId += 1;
      pauseAudio();
      isPlaying = false;
      isStarting = false;
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

  function clearQueue() {
    playbackRequestId += 1;
    cancelSeek();

    tracks = [];
    queueName = "Queue";
    queueIsLibrary = false;
    order.clear();
    currentTime = 0;
    seekTime = 0;
    duration = 0;
    isPlaying = false;
    isStarting = false;
    playbackError = "";

    unloadAudio();
    persistLibrary();
  }

  function clearLibrary() {
    library = [];
    clearQueue();
  }

  function removeTrack(id: string) {
    if (!library.some((track) => track.id === id)) return;
    library = library.filter((track) => track.id !== id);
    if (!removeFromQueue(id, false)) persistLibrary();
  }

  function removeFromQueue(id: string, detach = true): boolean {
    const removedIndex = tracks.findIndex((track) => track.id === id);

    if (removedIndex < 0) return false;
    if (detach) queueIsLibrary = false;

    const selectedId = currentTrack?.id;
    const continuePlaying = isPlaying || isStarting;

    tracks = tracks.filter((track) => track.id !== id);

    if (tracks.length === 0) {
      clearQueue();
      return true;
    }

    if (id === selectedId) {
      const nextIndex = Math.min(removedIndex, tracks.length - 1);
      selectTrack(nextIndex, continuePlaying);
    } else {
      persistLibrary();
    }

    order.finishCycle(repeatMode === "all");
    persistSettings();
    return true;
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
      isStarting = false;
      playbackError =
        "Could not open this file. It may be missing or unsupported.";
    });

    let removeCloseListener: (() => void) | undefined;

    if (isTauri()) {
      const saved = loadLibrary();
      library = saved.tracks;
      const byId = new Map(library.map((track) => [track.id, track]));
      queueIsLibrary = saved.queue?.isLibrary ?? true;
      queueName = saved.queue?.name ?? "Music";
      tracks = queueIsLibrary || !saved.queue ? [...library]
        : saved.queue.trackIds.flatMap((id) => {
          const track = byId.get(id);
          return track ? [track] : [];
        });
      libraryReady = !saved.readError;
      if (saved.readError) storageError = "Could not load your library. Your saved data was kept.";

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

    isReady = libraryReady;

    const removeShortcuts = registerPlayerShortcuts({
      togglePlayback,

      nextTrack: () => {
        if (order.canNext(repeatMode === "all")) {
          navigate("next");
        }
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
      isPlaying = false;
      isStarting = false;

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
    get library() { return library; },
    get queueName() { return queueName; },
    get isReady() { return isReady; },
    get currentIndex() { return currentIndex; },
    get currentTrack() { return currentTrack; },
    get playbackError() { return playbackError || storageError; },
    get isPlaying() { return isPlaying || isStarting; },
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
    chooseFiles: () => importFiles(true),
    choosePlaylistFiles: () => importFiles(false),
    playCollection,
    playLibraryTrack,
    selectTrack,
    playTrack,
    removeTrack,
    removeFromQueue,
    clearQueue,
    clearLibrary,
    togglePlayback,
    handleVolumeChange,
    cycleRepeat,
    startSeeking,
    previewSeek,
    commitSeek,
    cancelSeek,
    seekBy,
  };
}
