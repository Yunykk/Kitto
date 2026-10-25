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