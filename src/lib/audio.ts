import { convertFileSrc } from "@tauri-apps/api/core";

export type AudioProgress = {
  currentTime: number;
  duration: number;
};

const audio = new Audio();
audio.preload = "metadata";

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

export function loadAudio(path: string, position = 0) {
  audio.pause();
  pendingPosition = Number.isFinite(position) ? Math.max(0, position) : 0;
  audio.src = convertFileSrc(path);
  audio.load();
}

export function unloadAudio() {
  audio.pause();
  pendingPosition = null;
  audio.removeAttribute("src");
  audio.load();
}

export function playAudio() {
  return audio.play();
}

export function pauseAudio() {
  audio.pause();
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

  audio.currentTime = Math.max(0, Math.min(time, audio.duration));
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