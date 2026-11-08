export const SOURCE_FREQUENCY = 440;

export const tuningFrequencies = [
    396,
    432,
    528,
    639,
    741,
    852,
] as const;


export type TuningFrequency = (typeof tuningFrequencies)[number];
export type TuningTarget = TuningFrequency | null;

export function isTuningFrequency(
    value: unknown,
): value is TuningFrequency {
    return typeof value === "number"
        && tuningFrequencies.some((frequency) => frequency === value);
}

export function parseTuningTarget(value: unknown): TuningTarget {
    return isTuningFrequency(value) ? value : null;
}

export function tuningRatio(target: TuningTarget): number {
    return target === null ? 1 : target / SOURCE_FREQUENCY;
}