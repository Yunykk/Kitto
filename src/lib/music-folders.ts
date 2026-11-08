import { pathKey } from "./library";

export type FolderSelection = {
    name: string;
    location: string;
    kind: "directory" | "document-tree";
};

export type MusicFolder = FolderSelection & {
    id: string;
    addedAt: number;
    lastScannedAt: number | null;
    trackIds: string[];
};

export type FolderLoadResults = {
    folders: MusicFolder[];
    canWrite: boolean;
    error: string;
};

const STORAGE_KEY = "kitto.folders.v1";



function isTimestamp(value: unknown): value is number {
    return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 8.64e15
    );
}

function isMusicFolder(value: unknown): value is MusicFolder {
    if (typeof value !== "object" || value === null) return false;

    return (
        "id" in value &&
        typeof value.id === "string" &&
        value.id.length > 0 &&
        "name" in value &&
        typeof value.name === "string" &&
        value.name.trim().length > 0 &&
        "location" in value &&
        typeof value.location === "string" &&
        value.location.trim().length > 0 &&
        "kind" in value &&
        (value.kind === "directory" || value.kind === "document-tree") &&
        "addedAt" in value &&
        isTimestamp(value.addedAt) &&
        "lastScannedAt" in value &&
        (value.lastScannedAt === null || isTimestamp(value.lastScannedAt)) &&
        "trackIds" in value &&
        Array.isArray(value.trackIds) &&
        value.trackIds.every(
            (id: unknown) => typeof id === "string" && id.length > 0,
        )
    );
}

export function folderKey(
    folder: Pick<FolderSelection, "kind" | "location">,
): string{
    const location = 
        folder.kind === "directory"
            ? pathKey(folder.location).replace(/\/+$/, "") || "/"
            : folder.location;

    return `${folder.kind}:${location}`;
}



export function createMusicFolder(
    selection: FolderSelection,
): MusicFolder {
    const name = selection.name.trim();

    if (!name || !selection.location.trim()) {
        throw new Error("Could not read the selected folder");
    }

    return {
        id: crypto.randomUUID(),
        name,
        location: selection.location,
        kind: selection.kind,
        addedAt: Date.now(),
        lastScannedAt: null,
        trackIds: [],
    };
}


export function loadMusicFolders(): FolderLoadResults {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        
        if (raw === null) {
            return { folders: [], canWrite: true, error: ""};
        }

        const data: unknown = JSON.parse(raw);

        if (
            typeof data !== "object" ||
            data === null ||
            !("version" in data) ||
            data.version !== 1 ||
            !("folders" in data) ||
            !Array.isArray(data.folders) ||
            !data.folders.every(isMusicFolder)
        ) {
            throw new Error("Invalid folder settings");
        }

        const ids = new Set<string>();
        const locations = new Set<string>();
        const folders: MusicFolder[] = [];

        for (const folder of data.folders) {
            const key = folderKey(folder);

            if (ids.has(folder.id) || locations.has(key)) continue;

            ids.add(folder.id);
            locations.add(key);

            folders.push({
                ...folder,
                trackIds: [...new Set(folder.trackIds)],
            });
        }

        return { folders, canWrite: true, error: "" };
    } catch {
        return {
            folders: [],
            canWrite: false,
            error: "Could not load music folders. Saved data was kept.",
        };
    }
}


export function saveMusicFolders(
    folders: readonly MusicFolder[],
): boolean {
    if (!folders.every(isMusicFolder)) return false;

    const ids = new Set(folders.map((folder) => folder.id));
    const locations = new Set(folders.map(folderKey));

    if (
        ids.size !== folders.length ||
        locations.size !== folders.length
    ) {
        return false;
    }

    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ version: 1, folders }),
        );

        return true;
    } catch {
        return false;
    }
}