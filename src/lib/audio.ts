const audio = new Audio();
let sourceUrl: string | null = null;

export function loadAudio(file: File) {
    audio.pause();

    if (sourceUrl) {
        URL.revokeObjectURL(sourceUrl);
    }

    sourceUrl = URL.createObjectURL(file);
    audio.src = sourceUrl;
}

export function playAudio() {
    return audio.play();
}

export function pauseAudio() {
    audio.pause();
}

export function onAudioEnded(callback: () => void) {
  audio.addEventListener("ended", callback);

  return () => {
    audio.removeEventListener("ended", callback);
  };
}

export function setVolume(value: number) {
    audio.volume = value;
}

export type AudioProgress = {
    currentTime: number;
    duration: number;
}

export function onAudioProgress(
    callback: (progress: AudioProgress) => void
) {
    const update = () => {
        callback({
            currentTime: audio.currentTime,
            duration: Number.isFinite(audio.duration) ? audio.duration : 0,
        });
    };

    const events = [
        "loadedmetadata",
        "durationchange",
        "timeupdate",
        "seeked",
        "emptied",
        "ended",
    ];
    for (const event of events) {
        audio.addEventListener(event, update);
    }

    update();

    return () => {
        for (const event of events) {
            audio.removeEventListener(event, update);
        }
    };
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