import { readTrackMetadata } from "./metadata";
import type { TrackTags } from "./types";

type TrackMetadata = TrackTags & { coverUrl: string | null };

export function createTrackMetadata(
    getPath: () => string | null,
) {
    let data = $state<TrackMetadata | null>(null);
    let isLoading = $state(false);
    let error = $state("");
    let activePath = $state<string | null>(null);

    $effect(() => {
        const path = getPath();

        activePath = path;
        data = null;
        error = "";
        isLoading = path !== null;

        if (!path) return;

        const controller = new AbortController();
        let coverUrl: string | null = null;

        async function load(path: string) {
            try {
                const result = await readTrackMetadata(
                    path,
                    controller.signal,
                );

                if (controller.signal.aborted) return;

                if (result.cover) {
                    coverUrl = URL.createObjectURL(result.cover);
                }

                data = {
                    title: result.title,
                    artist: result.artist,
                    album: result.album,
                    coverUrl,
                };
            } catch (cause) {
                if (controller.signal.aborted) return;

                error = "Metadata unavailable";
                console.warn("Could not read track metadata.", cause);
            } finally {
                if (!controller.signal.aborted) {
                    isLoading = false;
                }

                controller.abort();
            }
        }

        void load(path);

        return () => {
            controller.abort();

            if (coverUrl) {
                URL.revokeObjectURL(coverUrl);
            }
        };
    });

    return {
        get data() {
            return activePath === getPath() ? data : null;
        },

        get isLoading() {
            const path = getPath();
            return path !== null && (activePath !== path || isLoading);
        },

        get error() {
            return activePath === getPath() ? error : "";
        },
    };
}
