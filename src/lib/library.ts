import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { QueueTrack } from "./types";
import { isContentUri, requirePlayablePaths } from "./media-location";
import { androidRequest, isAndroidAudio } from "./android-bridge";

export type SavedQueue = {
  trackIds: string[];
  name: string;
  isLibrary: boolean;
};

export type LibraryState = {
  tracks: QueueTrack[];
  currentTrackId: string | null;
  position: number;
  queue?: SavedQueue;
  readError?: boolean;
};

const LIBRARY_KEY = "kitto.library.v1";

export function pathKey(path: string): string {
  return /^[a-z]:[\\/]/i.test(path) || path.startsWith("\\\\")
    ? path.replace(/\\/g, "/").toLowerCase()
    : path;
}

function timestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value : undefined;
}

function parseTrack(value: unknown): QueueTrack | null {
  if (typeof value !== "object" || value === null ||
      !("id" in value) || typeof value.id !== "string" || !value.id ||
      !("title" in value) || typeof value.title !== "string" ||
      !("path" in value) || typeof value.path !== "string" || !value.path) return null;
  return {
    id: value.id,
    title: value.title,
    path: value.path,
    addedAt: "addedAt" in value ? timestamp(value.addedAt) : undefined,
    lastPlayedAt: "lastPlayedAt" in value ? timestamp(value.lastPlayedAt) : undefined,
  };
}

export async function pickTracks(): Promise<QueueTrack[]> {
  if (!isTauri()) throw new Error("Open the Kitto app to add files.");
  if (isAndroidAudio()) {
    const result = await androidRequest<{
      documents: { uri: string; name: string }[];
    }>("pickDocuments");
    if (!Array.isArray(result.documents) || result.documents.some((document) =>
      !document || typeof document.uri !== "string" || !isContentUri(document.uri) ||
      typeof document.name !== "string",
    )) throw new Error("Could not read the selected Android documents. No files were added.");

    const seen = new Set<string>();
    return result.documents.filter((document) => {
      if (seen.has(document.uri)) return false;
      seen.add(document.uri);
      return true;
    }).map((document) => ({
      id: crypto.randomUUID(),
      title: document.name.trim() || "Audio file",
      path: document.uri,
      addedAt: Date.now(),
    }));
  }
  const selected = await open({
    title: "Add music",
    multiple: true,
    directory: false,
    filters: [{
      name: "Audio",
      extensions: ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"],
    }],
  });
  if (!selected) return [];
  const paths = Array.isArray(selected) ? selected : [selected];
  requirePlayablePaths(paths);
  const seen = new Set<string>();
  return paths.filter((path) => {
    const key = pathKey(path);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((path) => ({
    id: crypto.randomUUID(),
    title: (/^[a-z]:[\\/]/i.test(path) || path.startsWith("\\\\")
      ? path.split(/[\\/]/) : path.split("/")).pop() || path,
    path,
    addedAt: Date.now(),
  }));
}

export function loadLibrary(): LibraryState {
  const empty: LibraryState = { tracks: [], currentTrackId: null, position: 0 };
  try {
    const saved = localStorage.getItem(LIBRARY_KEY);
    if (saved === null) return empty;
    const data: unknown = JSON.parse(saved);
    if (typeof data !== "object" || data === null ||
        !("tracks" in data) || !Array.isArray(data.tracks)) return { ...empty, readError: true };
    const ids = new Set<string>();
    const paths = new Set<string>();
    const tracks = data.tracks.map(parseTrack).filter((track): track is QueueTrack => {
      if (!track || ids.has(track.id) || paths.has(pathKey(track.path))) return false;
      ids.add(track.id);
      paths.add(pathKey(track.path));
      return true;
    });
    const currentTrackId = "currentTrackId" in data &&
      typeof data.currentTrackId === "string" && ids.has(data.currentTrackId)
        ? data.currentTrackId : null;
    const position = "position" in data ? timestamp(data.position) ?? 0 : 0;
    let queue: SavedQueue | undefined;
    if ("queue" in data && typeof data.queue === "object" && data.queue !== null &&
        "trackIds" in data.queue && Array.isArray(data.queue.trackIds)) {
      queue = {
        trackIds: [...new Set(data.queue.trackIds.filter(
          (id): id is string => typeof id === "string" && ids.has(id),
        ))],
        name: "name" in data.queue && typeof data.queue.name === "string"
          ? data.queue.name.trim().slice(0, 80) || "Queue" : "Queue",
        isLibrary: "isLibrary" in data.queue && data.queue.isLibrary === true,
      };
    }
    return { tracks, currentTrackId, position, queue };
  } catch {
    return { ...empty, readError: true };
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
