import { convertFileSrc } from "@tauri-apps/api/core";
import { createEqualizerEngine } from "./equalizer-engine";
import type { EqualizerSettings } from "./equalizer";

export type AudioProgress = {
  currentTime: number;
  duration: number;
};

const audio = new Audio();
audio.crossOrigin = "anonymous";
audio.preload = "metadata";

const equalizer = createEqualizerEngine(audio);

let playRequestId = 0;

let pendingPosition: number | null = null;

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


export function loadAudio(path: string, position = 0) {
  pauseAudio();
  pendingPosition = Number.isFinite(position) ? Math.max(0, position) : 0;
  audio.src = convertFileSrc(path);
  audio.load();
}

export function unloadAudio() {
  pauseAudio();
  pendingPosition = null;
  audio.removeAttribute("src");
  audio.load();
}

export async function playAudio() {
  const requestId = ++playRequestId;
  try {
    await Promise.all([equalizer.resume(), audio.play()]);
  } catch (error) {
    if (requestId === playRequestId) audio.pause();
    throw error;
  }
}

export function pauseAudio() {
  playRequestId += 1;
  audio.pause();
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
  if (pendingPosition !== null) pendingPosition = position;
  audio.currentTime = position;
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
  return subscribe(["error"], () => {
    if (audio.error) callback();
  });
}
