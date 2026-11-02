import { onMount } from 'svelte';

type Favorite = {
    trackId: string;
    likedAt: number;
};

const STORAGE_KEY = "kitto.favorites.v1";
export const LIKED_SONGS_ID = "kitto:liked-songs";

function isFavorite(value: unknown): value is Favorite {
    if (typeof value !== "object" || value === null) return false;

    return (
        "trackId" in value &&
        typeof value.trackId === "string" &&
        value.trackId.length > 0 &&
        "likedAt" in value &&
        typeof value.likedAt === "number" &&
        Number.isFinite(value.likedAt) &&
        value.likedAt >= 0
    );
}

export function createFavorites() {
    let entries = $state<Favorite[]>([]);
    let separateTab = $state(false);
    let isReady = $state(false);
    let error = $state("");

    const byId = $derived(
        new Map(entries.map((entry) => [entry.trackId, entry]))
    );

    const ids = $derived(
        entries.map((entry) => entry.trackId),
    );

    onMount(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);

            if (saved === null) return;

            const data: unknown = JSON.parse(saved);
            
            if (
                typeof data !== "object" ||
                data === null ||
                !("version" in data) ||
                data.version !== 1 ||
                !("entries" in data) ||
                !Array.isArray(data.entries)
            ) {
                throw new Error("Invalid favorites data.");
            }

            const seen = new Set<string>();

            entries = data.entries
                .filter(isFavorite)
                .sort((a, b) => b.likedAt - a.likedAt)
                .filter((entry) => {
                    if (seen.has(entry.trackId)) return false;

                    seen.add(entry.trackId);
                    return true;
                });

            separateTab = 
                "separateTab" in data && data.separateTab === true;
        } catch {
            error = "Could not load your liked songs.";
        } finally {
            isReady = true;
        }
    });


    function save(
    next: Favorite[],
       nextSeparateTab = separateTab, 
    ): boolean {
        if (!isReady) return false;

        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                    version: 1,
                    entries: next,
                    separateTab: nextSeparateTab,
                }),
            );

            entries = next;
            separateTab = nextSeparateTab;
            error = "";

            return true;
        } catch {
            error = "Could not save your liked songs.";
            return false;
        }
    }

    function has(trackId: string): boolean {
        return byId.has(trackId);
    }

    function toggle(trackId: string): boolean {
        if (!isReady || !trackId) return false;

        const next = has(trackId)
            ?entries.filter((entry) => entry.trackId !== trackId)
            : [
                { trackId, likedAt: Date.now() },
                ...entries,
            ];
            
        return save(next);
    }


    function prune(availableIds: string[]): boolean {
        if (!isReady) return false;

        const available = new Set(availableIds);

        const next = entries.filter(
            (entry) => available.has(entry.trackId),
        );

        if (next.length === entries.length) return true;

        return save(next);
    }

    function setSeparateTab(value: boolean): boolean {
        return save(entries, value);
    }

    return {
        get ids() {
            return ids;
        },
        get separateTab() {
            return separateTab;
        },
        get isReady() {
            return isReady;
        },
        get error() {
            return error;
        },
        likedAt: (trackId: string) =>
            byId.get(trackId)?.likedAt ?? null,
        has,
        toggle,
        prune,
        setSeparateTab,
    };
}


export type FavoritesController = ReturnType<typeof createFavorites>;
