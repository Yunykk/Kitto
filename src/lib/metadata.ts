import { convertFileSrc } from "@tauri-apps/api/core";
import type { TrackTags } from "./types";
import { androidRequest, isAndroidAudio } from "./android-bridge";

type ParsedMetadata = TrackTags & { cover: Blob | null };

function positiveNumber(value:unknown): number | null {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value > 0
      ? value
      : null
}


export async function readTrackMetadata(
  path: string,
  signal: AbortSignal,
  includeCover = true,
): Promise<ParsedMetadata> {
  signal.throwIfAborted();
  if (isAndroidAudio()) {
    const metadata = await androidRequest<{
      title: string | null;
      artist: string | null;
      album: string | null;
      albumArtist?: string | null;
      trackNumber?: number | null;
      discNumber?: number | null;
      coverBase64: string | null;
      coverMime: string | null;
    }>("metadata", { uri: path, includeCover });
    signal.throwIfAborted();
    let cover: Blob | null = null;
    if (includeCover && metadata.coverBase64 && metadata.coverBase64.length <= 4 * 1024 * 1024 &&
        metadata.coverMime && /^image\/(png|jpeg|webp)$/.test(metadata.coverMime)) {
      try {
        const bytes = Uint8Array.from(atob(metadata.coverBase64), (value) => value.charCodeAt(0));
        cover = new Blob([bytes.buffer], { type: metadata.coverMime });
      } catch {
        // Keep valid tags when a provider returns an unreadable thumbnail.
      }
    }
    const text = (value: string | null) => typeof value === "string" ? value.trim() || null : null;
    return { title: text(metadata.title), artist: text(metadata.artist), album: text(metadata.album),
      albumArtist: text(metadata.albumArtist ?? null), trackNumber: positiveNumber(metadata.trackNumber),
      discNumber: positiveNumber(metadata.discNumber), cover };
  }
  const { parseWebStream, selectCover } = await import("music-metadata");
  signal.throwIfAborted();

  const response = await fetch(convertFileSrc(path), { signal });
  if (!response.ok || !response.body) {
    throw new Error("Could not read the audio file.");
  }

  const contentLength = Number(response.headers.get("Content-Length"));
  const { common } = await parseWebStream(
    response.body,
    {
      path,
      size: Number.isFinite(contentLength) && contentLength > 0
        ? contentLength
        : undefined,
    },
    { duration: false, skipCovers: !includeCover },
  );

  const picture = includeCover ? selectCover(common.picture) : null;
  const cover = picture
    ? new Blob([new Uint8Array(picture.data).buffer], { type: picture.format })
    : null;

  return {
    title: common.title?.trim() || null,
    artist: common.artist?.trim()
      || common.artists?.join(", ").trim()
      || common.albumartist?.trim()
      || null,
    album: common.album?.trim() || null,
    albumArtist: common.albumartist?.trim() || null,
    trackNumber: positiveNumber(common.track.no),
    discNumber: positiveNumber(common.disk.no),
    cover,
  };
}
