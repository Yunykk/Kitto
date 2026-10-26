import { untrack } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import type { DisplayTrack, QueueTrack, TrackTags } from "./types";
import { readTrackMetadata } from "./metadata";

export function createQueueMetadata(
    getTracks: () => QueueTrack[],
) {
    const cache = new SvelteMap<string, TrackTags>();

    let isIndexing = $state(false);
    let failedCount = $state(0);

    const tracks = $derived.by(() =>
        getTracks().map((track): DisplayTrack => {
            const tags = cache.get(track.path);

            return {
                ...track,
                title: tags?.title || track.title,
                fileName: track.title,
                artist: tags?.artist ?? null,
                album: tags?.album ?? null,
            };
        }),
    );

    async function indexTracks(
        queue: QueueTrack[],
        signal: AbortSignal,
    ) {
        try {
            for (const track of queue) {
                if (signal.aborted) return;
                if (cache.has(track.path)) continue;

                const request = new AbortController();
                const cancel = () => request.abort();

                signal.addEventListener("abort", cancel, {
                    once: true,
                });

                try {
                    const result = await readTrackMetadata(
                        track.path,
                        request.signal,
                        false,
                    );

                    if (signal.aborted) return;


                    cache.set(track.path, {
                        title: result.title,
                        artist: result.artist,
                        album: result.album,
                    });
                } catch {
                    if (signal.aborted) return;

                    failedCount += 1;
                } finally {
                    signal.removeEventListener("abort", cancel);
                    request.abort();
                }
            }
        } finally {
            if (!signal.aborted) {
                isIndexing = false;
            }
        }
    }


    $effect(() => {
        const queue = getTracks().slice();
        const paths = new Set(queue.map((track) => track.path));
        const controller = new AbortController();

        failedCount = 0;
        isIndexing = queue.length > 0;

        untrack(() => {
            for (const path of cache.keys()) {
                if (!paths.has(path)) {
                    cache.delete(path);
                }
            }

            void indexTracks(queue, controller.signal);
        });

        return () => {
            controller.abort();
        };
    });


    return {
        get tracks() {
            return tracks;
        },

        get isIndexing() {
            return isIndexing;
        },

        get error() {
            if (failedCount === 0) return "";

            const noun = failedCount === 1 ? "track" : "tracks";

            return `Could not read tags for ${failedCount} ${noun}.`;
        },
    };
}
