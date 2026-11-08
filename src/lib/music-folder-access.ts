import { basename, sep } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir } from "@tauri-apps/plugin-fs";
import { pathKey } from "./library";
import { isDesktopRuntime } from "./runtime";
import type { FolderSelection, MusicFolder } from "./music-folders";
import type { QueueTrack } from "./types";

export type FolderScanResult = {
    files: Pick<QueueTrack, "path" | "title">[];
    complete: boolean;
    warning: string;
};

const AUDIO_EXTENSIONS = new Set([
    "mp3",
    "wav",
    "ogg",
    "m4a",
    "aac",
    "flac",
    "opus",
]);

const MAX_FILES = 10_000;
const MAX_ENTRIES = 50_000;

export async function pickDesktopMusicFolder():
    Promise<FolderSelection | null> {
    if (!isDesktopRuntime()) {
        throw new Error("Open the desktop app to choose this folder");
    }

    const location = await open({
        title: "Add music folder",
        directory: true,
        recursive: true,
        multiple: false,
    });

    if (location === null) return null;

    return {
        name: (await basename(location)) || location,
        location,
        kind: "directory",
    };
}

export async function scanDesktopMusicFolder(
    folder: Pick<MusicFolder, "kind" | "location">,
    signal?: AbortSignal,
    onProgress?: (filesFound: number) => void,
): Promise<FolderScanResult> {
    if (!isDesktopRuntime() || folder.kind !== "directory") {
        throw new Error("This folder requires its native platform");
    }

    const separator = sep();
    const pending = [folder.location];
    const visited = new Set<string>();
    const files: FolderScanResult["files"] = [];

    let entriesRead = 0;
    let unredableFolders = 0;
    let limitReached = false;

    while (pending.length > 0 && !limitReached) {
        signal?.throwIfAborted();

        const directory = pending.pop()!;
        const key = pathKey(directory);

        if (visited.has(key)) continue;
        visited.add(key);

        let entries: Awaited<ReturnType<typeof readDir>>;

        try {
            entries = await readDir(directory);
        } catch {
            signal?.throwIfAborted();

            if (directory === folder.location) {
                throw new Error(
                    "Could not read this folder. Select it again to renew access",
                );
            }

            unredableFolders++;
            continue;
        }

        signal?.throwIfAborted();

        const hasSeparator =
            directory.endsWith(separator) ||
            (separator === "\\" && directory.endsWith("/"));

        const prefix = hasSeparator
            ? directory
            : `${directory}${separator}`;

        for (const entry of entries) {
            signal?.throwIfAborted();

            if (entriesRead >= MAX_ENTRIES) {
                limitReached = true;
                break;
            }

            entriesRead++;

            if (entry.isSymlink || entry.name.startsWith(".")) {
                continue;
            }

            const path = `${prefix}${entry.name}`;

            if (entry.isDirectory) {
                pending.push(path);
                continue;
            }

            if (!entry.isFile) continue;

            const extension = entry.name.split(".").pop()?.toLowerCase();

            if (!extension || !AUDIO_EXTENSIONS.has(extension)) {
                continue;
            }

            if (files.length >= MAX_FILES) {
                limitReached = true;
                break;
            }

            files.push({
                path,
                title: entry.name,
            });
        }

        onProgress?.(files.length);
    }

    signal?.throwIfAborted();

    const collator = new Intl.Collator(undefined, {
        numeric: true,
        sensitivity: "base",
    });

    files.sort((a, b) => collator.compare(a.path, b.path));

    const warnings: string[] = [];

    if (unredableFolders > 0) {
        warnings.push(
            `Could not read ${unredableFolders} subfolders`,
        );
    }

    if (limitReached) {
        warnings.push(
            "Scan limit reached. Choose a smaller folder to include all files",
        );
    }

    return {
        files,
        complete: unredableFolders === 0 && !limitReached,
        warning: warnings.join(" "),
    };
}