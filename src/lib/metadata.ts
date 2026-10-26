import { convertFileSrc } from "@tauri-apps/api/core";
import type { TrackTags } from "./types";

type ParsedMetadata = TrackTags & { cover: Blob | null };

export async function readTrackMetadata(
  path: string,
  signal: AbortSignal,
  includeCover = true,
): Promise<ParsedMetadata> {
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
    cover,
  };
}
