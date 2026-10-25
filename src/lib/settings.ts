export type RepeatMode = "off" | "one" | "all";

export type PlayerSettings = {
    volume: number;
    repeatMode: RepeatMode;
    shuffle: boolean;
};

const SETTINGS_KEY = "kitto.settings";

const defaults: PlayerSettings = {
    volume: 1,
    repeatMode: "off",
    shuffle: false,
};

export function loadSettings(): PlayerSettings {
    try {
        const saved = localStorage.getItem(SETTINGS_KEY);

        if (saved === null) return {...defaults};

        const data: unknown = JSON.parse(saved);

        if (typeof data !== "object" || data === null) {
            return {...defaults};
        }

    const volume =
        "volume" in data &&
        typeof data.volume === "number" &&
        Number.isFinite(data.volume)
            ? Math.max(0, Math.min(1, data.volume))
            : defaults.volume;
    const repeatMode =
        "repeatMode" in data &&
        (
            data.repeatMode === "off" ||
            data.repeatMode === "all" ||
            data.repeatMode === "one"
        )
            ? data.repeatMode
            : defaults.repeatMode;

        const shuffle =
            "shuffle" in data && typeof data.shuffle === "boolean"
                ? data.shuffle
                : defaults.shuffle

        return { volume, repeatMode, shuffle };
        } catch {
            return {...defaults};
        }
}

export function saveSettings(settings: PlayerSettings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
        return;
    }
}