import { convertFileSrc } from "@tauri-apps/api/core";
import { title } from "process";
import { cachedDataVersionTag } from "v8";

type TrackMetadata = {
    title: string | null;
    artist: string | null;
    album: string | null;
    coverUrl: string | null;
};

async function readTrackMetadata(
    path: string,
    signal: AbortSignal,
) {
    const { parseWebStream, selectCover } =
        await import("music-metadata");
    
    signal.throwIfAborted();

    const responce = await fetch(convertFileSrc(path), {
        signal,
    });

    if (!responce.ok || !responce.body) {
        throw new Error ("Could not read the audio file");
    }

    const contentLength = Number(
        responce.headers.get("Content-Length"),
    );

    const { common } = await parseWebStream(
        responce.body,
        {
            path,
            size:
                Number.isFinite(contentLength) && contentLength > 0
                    ? contentLength
                    : undefined,
        },
        {
            duration: false,
        },
    );

    const picture = selectCover(common.picture);

    const cover = picture
        ? new Blob(
            [new Uint8Array(picture.data).buffer],
            { type: picture.format },
        )
    : null;

    return {
        title: common.title?.trim() || null,
        artist:
            common.artist?.trim() ||
            common.artists?.join(", ").trim() ||
            common.albumartist?.trim() ||
            null,
        album: common.album?.trim() || null,
        cover,
    };
}


export function createTrackMetadata(
    getPath: () => string | null,
) {
    let data = $state<TrackMetadata | null>(null);
    let isLoading = $state(false);
    let error = $state("");

    $effect(() => {
        const path = getPath();

        data = null;
        error = "";
        isLoading = path !== null;

        if (!path) return;

        const controller = new AbortController();
        let coverUrl: string | null = null; 

        async function load() {
            try {
                const result = await readTrackMetadata(
                    path!,
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
                };
            } catch (cause) {
                if (controller.signal.aborted) return;

                error = "Metadata unavailable";
                console.warn("could not read track metadata", cause);
            } finally {
                if (!controller.signal.aborted) {
                    isLoading = false;
                }

                controller.abort();
            }
        }

        void load();

        return () => {
            controller.abort();

            if (coverUrl) {
                URL.revokeObjectURL(coverUrl);
            }
        };
    });

    return {
        get data() {
            return data;
        },

        get isLoading() {
            return isLoading
        },

        get error() {
            return error;
        },
    };
}