import { onMount } from "svelte";

export type Playlist = {
    id: string;
    name: string;
    trackIds: string[];
}

const STORAGE_KEY = "kitto.playlists.v1";

function isPlaylist(value: unknown): value is Playlist {
    if (typeof value !== "object" || value === null) return false;

    return (
        "id" in value &&
        typeof value.id === "string" &&
        value.id.length > 0 && 
        "name" in value &&
        typeof value.name === "string" &&
        value.name.trim().length > 0 &&
        value.name.length <= 80 &&
        "trackIds" in value && 

        Array.isArray(value.trackIds) &&
        value.trackIds.every(
            (id: unknown) => typeof id === "string" && id.length > 0,
        )
    );
}




export function createPlaylists() {
    let playlists = $state<Playlist[]>([]);
    let error = $state("");
    let isReady = $state(false);

    function load() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);

            if (saved === null) return;

            const data: unknown = JSON.parse(saved);

            if (
                typeof data !== "object" ||
                data === null ||
                !("version" in data) ||
                data.version !== 1 ||
                !("playlists" in data) ||
                !Array.isArray(data.playlists) ||
                !data.playlists.every(isPlaylist)
            ) {
                throw new Error("Invalid playlist data");
            }

            playlists = data.playlists.map((playlist) => ({
                id: playlist.id,
                name: playlist.name.trim(),
                trackIds: [...new Set(playlist.trackIds)],
            }));

            error = "";
        } catch {
            error = "Could not load your playlists"
        } finally {
            isReady = true;
        }
    }

    function save(next: Playlist[]): boolean {
        if (!isReady) return false;

        try {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                    version: 1,
                    playlists: next,
                }),
            );

            playlists = next;
            error = "";
            return true
        } catch {
            error = "Could not save your playlists (sorry)";
            return false
        }
    }

    function create(value: string): string | null {
        if (!isReady) return null;

        const name = value.trim().replace(/\s+/g, " ");

        if (name.length === 0 || name.length > 80) {
            error = "Name is to longg, pls use a shorter one";
            return null;
        } 

        const playlist: Playlist = {
            id: crypto.randomUUID(),
            name,
            trackIds: [],
        };


        const saved = save([...playlists, playlist]);

        return saved ? playlist.id : null;
    }

    onMount(load);

    return {
        get playlists() {
            return playlists;
        },
        get error() {
            return error;
        },
        get isReady() {
            return isReady;
        },
        create,
    };
}


