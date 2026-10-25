import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { QueueTrack } from "./types";

export type LibraryState = {
    tracks: QueueTrack[];
    currentTrackId: string | null;
    position: number;
};

const LIBRARY_KEY = "kitto.library.v1";

function emptyLibrary(): LibraryState {
    return {
        tracks: [],
        currentTrackId: null,
        position: 0,
    };
}

function isTrack(value: unknown): value is QueueTrack {
    return (
        typeof value === "object" &&
        value !== null &&
        "id" in value &&
        typeof value.id === "string" &&
        value.id.length > 0 &&
        "title" in value &&
        typeof value.title === "string" &&
        "path" in value &&
        typeof value.path === "string" &&
        value.path.length > 0
    );
}

export async function pickTracks(): Promise<QueueTrack[]> {
    if (!isTauri()) {
        throw new Error("Open the Kitto desktop app to add files.");
    }

    const selected = await open({
        title: "Add music",
        multiple: true,
        directory: false,
        filters: [
            {
                name: "Audio",
                extensions: ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"],
            },
        ],
    });
    if (!selected) return [];

    const paths = Array.isArray(selected) ? selected : [selected]

    return [...new Set(paths)].map((path) => ({
        id: crypto.randomUUID(),
        title: path.split(/[\\/]/).pop() || path,
        path,
    }))
}

export function loadLibrary(): LibraryState {
    try {
        const saved = localStorage.getItem(LIBRARY_KEY);

        if (saved == null) return emptyLibrary();

        const data: unknown = JSON.parse(saved);

        if (
            typeof data !== "object" ||
            data === null ||
            !("tracks" in data) ||
            !Array.isArray(data.tracks)
        ) {
            return emptyLibrary();
        }
        const ids = new Set<string>();

        const tracks = data.tracks.filter(isTrack).filter((track) => {
            if (ids.has(track.id)) return false;

            ids.add(track.id);
            return true;
        });

        const currentTrackId =
            "currentTrackId" in data &&
            typeof data.currentTrackId === "string"
                ? data.currentTrackId
                :null;

        const position =
            "position" in data &&
            typeof data.position === "number" &&
            Number.isFinite(data.position)
                ? Math.max(0, data.position)
                : 0;
        return { tracks, currentTrackId, position };
    }   catch {
        return emptyLibrary();
    }
}

export function saveLibrary(state: LibraryState): boolean {
    try {
        localStorage.setItem(LIBRARY_KEY, JSON.stringify(state));
        return true;
    } catch {
        return false;
    }
}
