import { convertFileSrc, createAudioSource, needsLinuxAudioStream } from "./audio-source";
import { createEqualizerEngine } from "./equalizer-engine";
import type { EqualizerSettings } from "./equalizer";
import type { TuningTarget } from "./tuning";

export type AudioProgress = {
  currentTime: number;
  duration: number;
};

export type AudioPlaybackSnapshot = AudioProgress & {
  loadId: number;
  path: string | null;
  active: boolean;
  seeking: boolean;
  ended: boolean;
  playbackRate: number;
};

const audio = new Audio();
audio.crossOrigin = "anonymous";
audio.preload = "metadata";

const equalizer = createEqualizerEngine(audio, () => {
  sourceError = true;
  audio.pause();
  for (const listener of sourceErrorListeners) listener();
});
const linuxSource = needsLinuxAudioStream() ? createAudioSource() : null;
let sourceReady: Promise<void> | null = null;
let sourceError = false;
const sourceErrorListeners = new Set<() => void>();

let playRequestId = 0;

let pendingPosition: number | null = null;
let loadId = 0;
let loadedPath: string | null = null;
const playbackListeners = new Set<(value: AudioPlaybackSnapshot) => void>();

export function getAudioPlayback(): AudioPlaybackSnapshot {
  return {
    loadId, path: loadedPath,
    currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
    duration: Number.isFinite(audio.duration) ? audio.duration : 0,
    active: !audio.paused && !audio.ended && !audio.error && !audio.seeking && audio.readyState >= 3,
    seeking: audio.seeking === true,
    ended: audio.ended === true,
    playbackRate: Number.isFinite(audio.playbackRate) ? audio.playbackRate : 1,
  };
}

function publishPlayback(seeking = false) {
  const value = getAudioPlayback();
  if (seeking) { value.seeking = true; value.active = false; }
  for (const callback of playbackListeners) callback(value);
}

for (const event of ["playing", "pause", "waiting", "seeking", "seeked", "timeupdate", "ended", "error", "emptied", "loadedmetadata", "durationchange", "ratechange"]) {
  audio.addEventListener(event, () => publishPlayback());
}

export function onAudioPlayback(callback: (value: AudioPlaybackSnapshot) => void) {
  playbackListeners.add(callback);
  callback(getAudioPlayback());
  return () => { playbackListeners.delete(callback); };
}

audio.addEventListener("loadedmetadata", () => {
  const position = pendingPosition;
  pendingPosition = null;

  if (
    position !== null &&
    Number.isFinite(audio.duration) &&
    audio.duration > 0
  ) {
    audio.currentTime = Math.min(
      position,
      Math.max(0, audio.duration - 0.05),
    );
  }
});
audio.addEventListener("seeking", () => equalizer.resetTuning());

function subscribe(events: string[], callback: () => void) {
  for (const event of events) {
    audio.addEventListener(event, callback);
  }

  return () => {
    for (const event of events) {
      audio.removeEventListener(event, callback);
    }
  };
}

export function configureEqualizer(settings: EqualizerSettings) {
  equalizer.configure(settings);
}

export const configureTuning = (target: TuningTarget) => equalizer.configureTuning(target);


export function loadAudio(path: string, position = 0) {
  pauseAudio();
  loadId += 1;
  loadedPath = path;
  pendingPosition = Number.isFinite(position) ? Math.max(0, position) : 0;
  sourceError = false;
  if (linuxSource) {
    const current = loadId;
    audio.removeAttribute("src");
    audio.load();
    sourceReady = linuxSource.load(path, (url) => {
      equalizer.prepare();
      audio.src = url;
      audio.load();
    });
    void sourceReady.catch(() => {
      if (current !== loadId) return;
      sourceError = true;
      for (const listener of sourceErrorListeners) listener();
    });
  } else {
    audio.src = convertFileSrc(path);
    audio.load();
  }
  publishPlayback();
}

export function unloadAudio() {
  pauseAudio();
  loadId += 1;
  loadedPath = null;
  pendingPosition = null;
  sourceReady = null;
  sourceError = false;
  linuxSource?.release();
  audio.removeAttribute("src");
  audio.load();
  publishPlayback();
}

export async function playAudio() {
  const requestId = ++playRequestId;
  try {
    await Promise.all([equalizer.resume(), sourceReady ?? Promise.resolve()]);
    if (requestId !== playRequestId) return;
    await audio.play();
  } catch (error) {
    if (requestId === playRequestId) audio.pause();
    throw error;
  }
}

export function pauseAudio() {
  playRequestId += 1;
  publishPlayback();
  audio.pause();
  equalizer.resetTuning();
  publishPlayback();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unloadAudio();
    equalizer.dispose();
  });
}

export function setVolume(value: number) {
  audio.volume = value;
}

export function seekTo(time: number) {
  if (
    !Number.isFinite(time) ||
    !Number.isFinite(audio.duration) ||
    audio.duration <= 0
  ) {
    return;
  }

  const position = Math.max(0, Math.min(time, audio.duration));
  publishPlayback();
  if (pendingPosition !== null) pendingPosition = position;
  audio.currentTime = position;
  publishPlayback(true);
}

export function getAudioProgress(): AudioProgress {
  return {
    currentTime: pendingPosition ?? audio.currentTime,
    duration: Number.isFinite(audio.duration) ? audio.duration : 0,
  };
}

export function onAudioProgress(
  callback: (progress: AudioProgress) => void,
) {
  const update = () => callback(getAudioProgress());

  const unsubscribe = subscribe(
    [
      "loadedmetadata",
      "durationchange",
      "timeupdate",
      "seeked",
      "emptied",
      "ended",
    ],
    update,
  );

  update();
  return unsubscribe;
}

export function onAudioEnded(callback: () => void) {
  return subscribe(["ended"], () => {
    if (audio.ended) callback();
  });
}

export function onAudioError(callback: () => void) {
  sourceErrorListeners.add(callback);
  if (sourceError) callback();
  const unsubscribe = subscribe(["error"], () => {
    if (audio.error) callback();
  });
  return () => { unsubscribe(); sourceErrorListeners.delete(callback); };
}
