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
  nativeAudio,
} from "./audio";
import { createPlaybackOrder } from "./playback-order.svelte";
import { isDesktopRuntime } from "./runtime";

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
  let nativeCanNext = $state(false);
  let nativeCanPrevious = $state(false);
  let nativeEqualizerAvailable = $state<boolean | null>(null);
  let nativeReady = false;
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

  function mergeImportedTracks(
    selected: readonly QueueTrack[],
    appendToQueue: boolean,
  ): string[] | null {
    if (
      disposed ||
      !libraryReady ||
      (nativeAudio && !nativeReady)
    ) {
      return null;
    }

    if (selected.length === 0) return [];

    const byPath = new Map(
      library.map((track) => [pathKey(track.path), track]),
    );

    const added: QueueTrack[] = [];
    const importedIds = new Set<string>();

    for (const candidate of selected) {
      const key = pathKey(candidate.path);
      let track = byPath.get(key);

      if (!track) {
        track = {
          ...candidate,
          addedAt: candidate.addedAt ?? Date.now(),
        };

        byPath.set(key, track);
        added.push(track);
      }

      importedIds.add(track.id);
    }

    const nextLibrary = added.length > 0
      ? [...library, ...added]
      : library;

    const updateQueue =
      appendToQueue && (queueIsLibrary || tracks.length === 0);
    
      const nextQueue = updateQueue ? [...nextLibrary] : tracks;

      const nextIsLibrary = updateQueue
        ? true
        : !appendToQueue && added.length > 0
          ? false
          : queueIsLibrary;

      const nextQueueName = updateQueue ? "Music" : queueName;

      const currentId = currentTrack?.id ?? null;
      const nextCurrentId = currentId ??
        (updateQueue ? nextQueue[0]?.id ?? null : null);
      
      const saved = saveLibrary({
        tracks: nextLibrary,
        queue: {
          trackIds: nextQueue.map((track) => track.id),
          name: nextQueueName,
          isLibrary: nextIsLibrary,
        },
        currentTrackId: nextCurrentId,
        position: currentId ? getAudioProgress().currentTime : 0,
      });

      if (!saved) {
        storageError = "Could not save your library"
        return null;
      }

      library = nextLibrary;
      queueIsLibrary = nextIsLibrary;
      queueName = nextQueueName;
      storageError = "";
      lastSavedAt = performance.now();

      if (updateQueue) {
        tracks = nextQueue;

        if (currentIndex < 0 && tracks.length > 0) {
          selectTrack(0);
        }

        nativeAudio?.syncQueue(tracks);
      }

      return [...importedIds];
  }

  async function importFiles(
    appendToQueue: boolean,
    ): Promise<string[] | null> {
    
    if (isChoosingFiles || disposed) return [];
    if (nativeAudio && !nativeReady) return null;
    if (isTauri() && !libraryReady) return null;


    isChoosingFiles = true;
    playbackError = "";

    try {
      const selected = await pickTracks();


      if (disposed || selected.length === 0) return [];


      return mergeImportedTracks(selected, appendToQueue);
    } catch (cause) {
      if (!disposed) {
        playbackError = cause instanceof Error
          ? cause.message
          : "Could not choose audio files";
      }

      return null;
    } finally {
      isChoosingFiles = false;
      }
    }
    
    function importFolderFiles(
      files: readonly Pick<QueueTrack, "path" | "title">[],
    ): string[] | null {
      if (isChoosingFiles || disposed) return null;

      const selected: QueueTrack[] = files.map((file) => ({
        id: crypto.randomUUID(),
        path: file.path,
        title: file.title,
        addedAt: Date.now(),
      }));

      return mergeImportedTracks(selected, queueIsLibrary);
    }

  function playCollection(
    ids: string[],
    name: string,
    startId: string | null = null,
    isLibrary = false,
  ): boolean {
    if (nativeAudio && !nativeReady) return false;
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
    if (nativeAudio && !nativeReady) return;
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

    nativeAudio?.setContext(tracks);
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

  function pausePlayback() {
    playbackRequestId += 1;
    pauseAudio();
    isPlaying = false;
    isStarting = false;
    persistLibrary();
  }

  function togglePlayback() {
    if (!currentTrack) return;
    if (isPlaying || isStarting) { pausePlayback(); return; }

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
    nativeAudio?.setOptions(order.shuffle, repeatMode);
    persistSettings();
  }

  function toggleShuffle() {
    order.setShuffle(!order.shuffle);
    nativeAudio?.setOptions(order.shuffle, repeatMode);
    persistSettings();
  }

  function navigate(direction: "next" | "previous") {
    if (nativeAudio) {
      if (direction === "next") nativeAudio.next();
      else nativeAudio.previous();
      return;
    }
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
      nativeAudio?.syncQueue(tracks);
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
      // The Android service advances its own queue even when the WebView sleeps.
      if (nativeAudio) return;
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
    let removeNativeState: (() => void) | undefined;

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

      if (tracks.length > 0 && !nativeAudio) {
        selectTrack(
          savedIndex >= 0 ? savedIndex : 0,
          false,
          savedIndex >= 0 ? saved.position : 0,
        );
      }

      if (nativeAudio) {
        nativeAudio.setContext(tracks);
        void nativeAudio.connect().then((value) => {
          if (disposed) return;
          nativeReady = true;
          const restored = tracks.find((track) => track.path === value.path);
          if (restored) {
            order.select(restored.id);
            order.setShuffle(value.shuffle);
            repeatMode = value.repeatMode;
          } else if (tracks.length > 0) {
            selectTrack(savedIndex >= 0 ? savedIndex : 0, false, savedIndex >= 0 ? saved.position : 0);
            nativeAudio?.setOptions(order.shuffle, repeatMode);
          }
          removeNativeState = nativeAudio?.onState((state) => {
            if (disposed) return;
            const track = tracks.find((item) => item.path === state.path);
            if (track && track.id !== order.currentId) {
              order.select(track.id);
              library = library.map((item) => item.id === track.id ? { ...item, lastPlayedAt: Date.now() } : item);
            }
            currentTime = state.position;
            duration = state.duration;
            isPlaying = state.playing;
            isStarting = state.buffering && state.playing;
            nativeCanNext = state.canNext;
            nativeCanPrevious = state.canPrevious;
            if (state.playing && !state.buffering) nativeEqualizerAvailable = state.equalizerAvailable ?? null;
            if (order.shuffle !== state.shuffle) order.setShuffle(state.shuffle);
            repeatMode = state.repeatMode;
            playbackError = state.error ?? "";
            if (performance.now() - lastSavedAt >= 1500) persistLibrary();
          });
          isReady = libraryReady;
        }).catch(() => {
          if (!disposed) playbackError = "Could not connect to Android playback. Reopen Kitto to try again.";
        });
      }

      if (isDesktopRuntime()) void getCurrentWindow()
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

    isReady = libraryReady && !nativeAudio;

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
    const onVisibility = () => {
      persistLibrary();
      if (document.visibilityState === "visible") void nativeAudio?.refresh();
    };
    if (nativeAudio) document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      persistLibrary();
      playbackRequestId += 1;
      isPlaying = false;
      isStarting = false;

      window.removeEventListener("pagehide", persistLibrary);
      removeShortcuts();
      removeCloseListener?.();
      removeNativeState?.();
      if (nativeAudio) document.removeEventListener("visibilitychange", onVisibility);
      unsubscribeProgress();
      unsubscribeEnded();
      unsubscribeError();
      if (!nativeAudio) unloadAudio();
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
    get nativeEqualizerAvailable() { return nativeEqualizerAvailable; },
    get duration() { return duration; },
    get displayTime() { return displayTime; },
    get progress() { return progress; },
    get isShuffling() { return order.shuffle; },
    get canNext() { return nativeAudio ? nativeCanNext : order.canNext(repeatMode === "all"); },
    get canPrevious() { return nativeAudio ? nativeCanPrevious : order.canPrevious(repeatMode === "all"); },
    toggleShuffle,
    nextTrack: () => navigate("next"),
    previousTrack: () => navigate("previous"),
    chooseFiles: () => importFiles(true),
    choosePlaylistFiles: () => importFiles(false),
    importFolderFiles,
    playCollection,
    playLibraryTrack,
    selectTrack,
    playTrack,
    removeTrack,
    removeFromQueue,
    clearQueue,
    clearLibrary,
    togglePlayback,
    pausePlayback,
    savePlaybackState: persistLibrary,
    handleVolumeChange,
    cycleRepeat,
    startSeeking,
    previewSeek,
    commitSeek,
    cancelSeek,
    seekBy,
  };
}
