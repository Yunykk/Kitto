export const equalizerBands = [
  { frequency: 31.25, label: "31" },
  { frequency: 62.5, label: "63" },
  { frequency: 125, label: "125" },
  { frequency: 250, label: "250" },
  { frequency: 500, label: "500" },
  { frequency: 1000, label: "1k" },
  { frequency: 2000, label: "2k" },
  { frequency: 4000, label: "4k" },
  { frequency: 8000, label: "8k" },
  { frequency: 16000, label: "16k" },
] as const;

export const equalizerPresets = [
  {
    id: "flat",
    name: "Flat",
    gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    id: "bass-boost",
    name: "Bass Boost",
    gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  },
  {
    id: "vocals",
    name: "Vocals",
    gains: [-2, -2, -1, 1, 3, 4, 3, 1, -1, -2],
  },
  {
    id: "treble-boost",
    name: "Treble Boost",
    gains: [-2, -1, 0, 0, 0, 1, 2, 3, 4, 5],
  },
] as const;


export type EqualizerSettings = {
    enabled: boolean;
    gains: number[];
    preamp: number;
    autoPreamp: boolean;
};

export type EqualizerPresetId =
    (typeof equalizerPresets)[number]["id"] | "custom";

export function defaultEqualizer(): EqualizerSettings {
    return {
        enabled: false,
        gains: equalizerBands.map(() => 0),
        preamp: 0,
        autoPreamp: true,
    };
}

export function clampDb(
    value: unknown,
    min = -12,
    max = 12,
): number {
    const number =
        typeof value === "number" && Number.isFinite(value)
            ? value
            : 0;

    const limited = Math.max(min, Math.min(max, number));
    const rounded = Math.round(limited * 2) / 2;

    return rounded === 0 ? 0 : rounded;
}

export function normalizeEqualizer(
    value: unknown,
): EqualizerSettings {
    if (typeof value !== "object" || value === null) {
        return defaultEqualizer();
    }

    const gains =
        "gains" in value && Array.isArray(value.gains)
            ? value.gains
            : [];

    return {
        enabled: "enabled" in value && value.enabled === true,

        gains: equalizerBands.map(
            (_, index) => clampDb(gains[index]),
        ),

        preamp: clampDb(
            "preamp" in value ? value.preamp : 0,
            -24,
            0,
        ),

        autoPreamp:
            !("autoPreamp" in value) || value.autoPreamp !== false,
    };
}


export function equalizerPresetId(
    gains: readonly number[],
): EqualizerPresetId {
    if (gains.length !== equalizerBands.length) return "custom";

    const preset = equalizerPresets.find((item) =>
        item.gains.every((gain, index) => gain === gains[index]),
    );

    return preset?.id ?? "custom";
}
