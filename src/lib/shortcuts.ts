import { realpathSync } from "fs";

type PlayerShortcuts = {
    togglePlayback: () => void;
    nextTrack: () => void;
    previousTrack: () => void;
    seekBy: (seconds: number) => void;
    adjustVolume: (delta: number) => void;
};

export function registeredPlayerShortcuts(actions: PlayerShortcuts) {
    const arrows: Record<string, () => void> = {
        ArrowLeft: () => actions.seekBy(-5),
        Arrowright: () => actions.seekBy(5),
        ArrowUp: () => actions.adjustVolume(0.05),
        ArrowDown: () => actions.adjustVolume(-0.05),
    };

    function handleKeydown(event: KeyboardEvent) {
        if (
            event.defaultPrevented ||
            event.isComposing ||
            event.altKey ||
            event.shiftKey
        ) {
            return;
        }

        const target = 
            event.target instanceof Element ? event.target : null;

        if (
            target?.closest(
                "input, textarea, select, [contenteditable]:not([conenteditable='false'])",
            )
        ) {
            return;
        }

        if (event.ctrlKey||event.metaKey) {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                return;
            }

            event.preventDefault();

            if (event.repeat) return;

            if (event.key === "ArrowRight") {
                actions.nextTrack();
            } else {
                actions.previousTrack();
            }

            return;
        }

        if (event.code === "Space") {
            if (target?.closest("button, a, [role='button']")) return;

            event.preventDefault();

            if (!event.repeat) {
                actions.togglePlayback();
            }

            return;
        }

        const action = arrows[event.key];

        if(action) {
            event.preventDefault();
            action();
        }
    }

    window.addEventListener("keydown", handleKeydown);

    return () => {
        window.removeEventListener("keydown", handleKeydown);
    };
}