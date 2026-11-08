import type { DisplayTrack } from "./types";

export type Album = {
    id: string;
    title: string;
    artist: string | null;
    tracks: DisplayTrack[];
};

function clean(value: string | null): string {
    return (value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
}

function albumKey(title: string, artist: string): string {
    return JSON.stringify([
        title.toLowerCase(),
        artist.toLowerCase(),
    ]);
}

function positiveNumber(value: number | null | undefined): number | null {
    return typeof value === "number"
        && Number.isSafeInteger(value)
        && value > 0
            ? value
            : null;
}

export function groupAlbums(tracks: readonly DisplayTrack[]): Album[] {
    const groups = new Map<string, Album>();
    const seen = new Set<string>();

    for (const track of tracks) {
        if (seen.has(track.id)) continue;
        seen.add(track.id);

        const title = clean(track.album);
        if (!title) continue;

        const artist = 
            clean(track.albumArtist ?? null) || clean(track.artist);
        const id = albumKey(title, artist);
        const existing = groups.get(id);

        if (existing) {
            existing.tracks.push(track);
        } else {
            groups.set(id, {
                id,
                title,
                artist: artist || null,
                tracks: [track],
            });
        }
    }

    const collator = new Intl.Collator(undefined, {
        numeric: true,
        sensitivity: "base",
    });

    for (const album of groups.values()) {
        album.tracks.sort((a, b) => {
            const discA = positiveNumber(a.discNumber) ?? 1;
            const discB = positiveNumber(b.discNumber) ?? 1;

            if (discA !== discB) return discA - discB;

            const trackA =
                positiveNumber(a.trackNumber) ?? Number.MAX_SAFE_INTEGER;
            
            const trackB =
                positiveNumber(b.trackNumber) ?? Number.MAX_SAFE_INTEGER;

            return trackA - trackB  
                || collator.compare(a.fileName, b.fileName)
                || collator.compare(a.title, b.title);
        });
    }

    return [...groups.values()].sort((a, b) => 
        collator.compare(a.title, b.title)
        || collator.compare(a.artist ?? "", b.artist ?? ""),
    );
}