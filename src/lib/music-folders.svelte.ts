import { onMount } from "svelte";
import {
    createMusicFolder,
    folderKey,
    loadMusicFolders,
    saveMusicFolders,
    type FolderSelection,
    type MusicFolder,
} from "./music-folders";
import type { FolderScanResult } from "./music-folder-access";

export type FolderAccess = {
    pick: () => Promise<FolderSelection | null>;
    scan: (
        folder: MusicFolder,
        signal: AbortSignal,
        onProgress: (filesFound: number) => void,
    ) => Promise<FolderScanResult>;
};

type ImportFolderFiles = (
    files: FolderScanResult["files"],
) => string[] | null;

export function createMusicFolders(
    access: FolderAccess,
    importFiles: ImportFolderFiles,
) {
    let folders = $state<MusicFolder[]>([]);
    let isReady = $state(false);
    let canWrite = $state(false);
    let isChoosing = $state(false);
    let scanningId = $state<string | null>(null);
    let filesFound = $state(0);
    let error = $state("");
    let warning = $state("");

    let activeScan: AbortController | null = null;
    let disposed = false;

    const isBusy = $derived(
        isChoosing || scanningId !== null,
    );

    function commit(next: MusicFolder[]): boolean {
        if (disposed || !isReady || !canWrite) return false;

        if (!saveMusicFolders(next)) {
            error = "Could not save music folders";
            return false;
        }

        folders = next;
        error = "";
        return true;
    }

    onMount(() => {
        const saved = loadMusicFolders();

        folders = saved.folders;
        canWrite = saved.canWrite;
        error = saved.error;
        isReady = true;

        return () => {
            disposed = true;
            activeScan?.abort();
        };
    });
    
    async function scan(id: string): Promise<boolean> {
        if (disposed || !isReady || !canWrite || isBusy) {
            return false;
        }

        const folder = folders.find((item) => item.id === id);
        if (!folder) return false;

        const operation = new AbortController();

        activeScan = operation;
        scanningId = id;
        filesFound = 0;
        error = "";
        warning = "";

        try {
            const result = await access.scan(
                folder,
                operation.signal,
                (count) => {
                    if (
                        !disposed &&
                        activeScan === operation &&
                        !operation.signal.aborted
                    ) {
                        filesFound = count;
                    }
                },
            );

            operation.signal.throwIfAborted();
            if (disposed) return false;

            const importedIds = importFiles(result.files);

            if (importedIds === null) {
                throw new Error (
                    "Could not import the scanned files into your library",
                );
            }

            const trackIds = result.complete
                ? [...new Set(importedIds)]
                : [...new Set([...folder.trackIds, ...importedIds])];

            const updated: MusicFolder = {
                ...folder,
                trackIds,
                lastScannedAt: result.complete
                    ? Date.now()
                    : folder.lastScannedAt,
            };

            const saved = commit(
                folders.map((item) => item.id === id ? updated : item),
            );

            if (!saved) return false;

            warning = result.warning;
            return true;
        } catch (cause) {
            if (!disposed && !operation.signal.aborted) {
                error = cause instanceof Error
                    ? cause.message
                    : "Could not scan this folder";
            }

            return false;
        } finally {
            if (activeScan === operation) {
                activeScan = null;
                scanningId = null;
                filesFound = 0;
            }
        }
    }
    
    async function add(): Promise<boolean> {
        if (disposed || !isReady || !canWrite || isBusy) {
            return false;
        }

        isChoosing = true;
        error = "";
        warning = "";

        let selectedFolder: MusicFolder | null = null;

        try {
            const selection = await access.pick();

            if (disposed || selection === null) return false;

            const key = folderKey(selection);
            const existing = folders.find(
                (folder) => folderKey(folder) === key,
            );

            if (existing) {
                selectedFolder = existing;
            } else {
                const created = createMusicFolder(selection);

                if (!commit([...folders, created])) return false;

                selectedFolder = created;
            }
        } catch (cause) {
            if (!disposed) {
                error = cause instanceof Error
                    ? cause.message
                    : "Could not choose a music folder.";
            }

            return false;
        } finally {
            isChoosing = false;
        }

        return selectedFolder
            ? scan(selectedFolder.id)
            : false;
    }

    function remove(id: string): boolean {
        if (disposed || !isReady || !canWrite || isBusy) {
            return false;
        }

        const next = folders.filter((folder) => folder.id !== id);

        if (next.length === folders.length) return true;

        const saved = commit(next);

        if (saved) warning = "";

        return saved;
    }

    function cancelScan(): void {
        activeScan?.abort();
    }

    return {
        get folders() { return folders; },
        get isReady() { return isReady; },
        get canWrite() {return canWrite; },
        get isBusy() { return isBusy; },
        get isChoosing() { return isChoosing; },
        get scanningId() { return scanningId; },
        get filesFound() { return filesFound; },
        get error() { return error; },
        get warning() { return warning; },
        add,
        scan,
        remove,
        cancelScan,
    };
}

export type MusicFoldersController =
    ReturnType<typeof createMusicFolders>;