import type { CoverStatus, TrackTags } from "./types";

type ParsedArtwork = TrackTags & { cover: Blob | null };
export type CachedArtwork = TrackTags & {
  coverUrl: string | null;
  coverStatus: Exclude<CoverStatus, "loading">;
  error: string;
};

type DecodedArtwork = { width: number; height: number; release?: () => void };
type CacheOptions = {
  readMetadata: (path: string, signal: AbortSignal) => Promise<ParsedArtwork>;
  decodeImage?: (url: string, signal: AbortSignal) => Promise<DecodedArtwork>;
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
  maxEntries?: number;
  maxBytes?: number;
};

export type ArtworkLease = {
  readonly result: CachedArtwork | null;
  promise: Promise<CachedArtwork>;
  release: () => void;
};

type Entry = {
  path: string;
  controller: AbortController;
  references: number;
  bytes: number;
  url: string | null;
  releaseImage: (() => void) | null;
  result: CachedArtwork | null;
  promise: Promise<CachedArtwork>;
};

export function decodeArtwork(url: string, signal: AbortSignal): Promise<DecodedArtwork> {
  signal.throwIfAborted();
  const image = new Image();
  image.decoding = "async";

  return new Promise((resolve, reject) => {
    let finished = false;
    const clear = () => { image.src = ""; };
    const fail = (cause: unknown) => {
      if (finished) return;
      finished = true;
      signal.removeEventListener("abort", cancel);
      clear();
      reject(cause);
    };
    const cancel = () => fail(signal.reason ?? new DOMException("Aborted", "AbortError"));

    signal.addEventListener("abort", cancel, { once: true });
    image.src = url;
    image.decode().then(() => {
      if (finished) return;
      if (signal.aborted) { cancel(); return; }
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        fail(new Error("Invalid cover image."));
        return;
      }
      finished = true;
      signal.removeEventListener("abort", cancel);
      resolve({ width: image.naturalWidth, height: image.naturalHeight, release: clear });
    }, fail);
  });
}

export function createArtworkCache(options: CacheOptions) {
  const entries = new Map<string, Entry>();
  const maxEntries = options.maxEntries ?? 8;
  const maxBytes = options.maxBytes ?? 32 * 1024 * 1024;
  const decode = options.decodeImage ?? decodeArtwork;
  const createUrl = options.createUrl ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeUrl = options.revokeUrl ?? ((url: string) => URL.revokeObjectURL(url));
  let disposed = false;

  function releaseResources(entry: Entry) {
    entry.releaseImage?.();
    entry.releaseImage = null;
    if (entry.url !== null) {
      revokeUrl(entry.url);
      entry.url = null;
    }
  }

  function remove(entry: Entry) {
    if (entries.get(entry.path) === entry) entries.delete(entry.path);
    entry.controller.abort();
    releaseResources(entry);
  }

  function evict() {
    let bytes = [...entries.values()].reduce((total, entry) => total + entry.bytes, 0);
    for (const entry of entries.values()) {
      if (entries.size <= maxEntries && bytes <= maxBytes) break;
      if (entry.references > 0) continue;
      bytes -= entry.bytes;
      remove(entry);
    }
  }

  async function load(entry: Entry): Promise<CachedArtwork> {
    const signal = entry.controller.signal;
    let tags: TrackTags = { title: null, artist: null, album: null };
    let parsed = false;
    let result: CachedArtwork;

    try {
      const metadata = await options.readMetadata(entry.path, signal);
      signal.throwIfAborted();
      tags = { title: metadata.title, artist: metadata.artist, album: metadata.album };
      parsed = true;

      if (metadata.cover === null) {
        result = { ...tags, coverUrl: null, coverStatus: "missing", error: "" };
      } else {
        entry.url = createUrl(metadata.cover);
        const decoded = await decode(entry.url, signal);
        if (signal.aborted) {
          decoded.release?.();
          signal.throwIfAborted();
        }
        entry.releaseImage = decoded.release ?? null;
        if (!Number.isFinite(decoded.width) || !Number.isFinite(decoded.height) || decoded.width <= 0 || decoded.height <= 0) {
          throw new Error("Invalid cover dimensions.");
        }
        entry.bytes = metadata.cover.size + decoded.width * decoded.height * 4;
        result = { ...tags, coverUrl: entry.url, coverStatus: "ready", error: "" };
      }
    } catch (cause) {
      releaseResources(entry);
      if (signal.aborted) throw cause;
      result = {
        ...tags,
        coverUrl: null,
        coverStatus: "error",
        error: parsed ? "Cover unavailable" : "Metadata unavailable",
      };
    }

    entry.result = result;
    evict();
    return result;
  }

  function acquire(path: string): ArtworkLease {
    if (disposed) throw new Error("Artwork cache is closed.");
    let entry = entries.get(path);

    if (!entry || entry.controller.signal.aborted || entry.result?.coverStatus === "error") {
      entry = {
        path,
        controller: new AbortController(),
        references: 0,
        bytes: 0,
        url: null,
        releaseImage: null,
        result: null,
        promise: undefined as unknown as Promise<CachedArtwork>,
      };
      entries.set(path, entry);
      entry.promise = load(entry);
      void entry.promise.catch(() => {});
    }

    const held = entry;
    held.references += 1;
    entries.delete(path);
    entries.set(path, held);
    let released = false;

    return {
      get result() { return held.result; },
      promise: held.promise,
      release() {
        if (released) return;
        released = true;
        held.references -= 1;
        if (held.references === 0 && (
          held.result === null || held.result.coverStatus === "error" || held.bytes > maxBytes
        )) {
          remove(held);
        }
        evict();
      },
    };
  }

  return {
    acquire,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of entries.values()) remove(entry);
    },
  };
}
