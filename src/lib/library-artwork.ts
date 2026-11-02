import { getContext, onDestroy, setContext } from "svelte";
import { createArtworkCache } from "./artwork-cache";
import { readTrackMetadata } from "./metadata";

const KEY = Symbol("library-artwork");

async function thumbnail(blob: Blob, signal: AbortSignal): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    signal.throwIfAborted();
    const canvas = new OffscreenCanvas(160, 160);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create a thumbnail.");
    const side = Math.min(bitmap.width, bitmap.height);
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2,
      side, side, 0, 0, 160, 160);
    const result = await canvas.convertToBlob({ type: "image/webp", quality: .82 });
    signal.throwIfAborted();
    return result;
  } finally {
    bitmap.close();
  }
}

function createLibraryArtwork() {
  let active = 0;
  const waiting: { start: () => void }[] = [];
  function slot(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const request = { start: () => {
        signal.removeEventListener("abort", cancel);
        active += 1;
        resolve();
      } };
      const cancel = () => {
        const index = waiting.indexOf(request);
        if (index >= 0) waiting.splice(index, 1);
        reject(signal.reason);
      };
      if (active < 2) request.start();
      else {
        waiting.push(request);
        signal.addEventListener("abort", cancel, { once: true });
      }
    });
  }
  return createArtworkCache({
    maxEntries: 64,
    maxBytes: 8 * 1024 * 1024,
    readMetadata: async (path, signal) => {
      await slot(signal);
      try {
        signal.throwIfAborted();
        const metadata = await readTrackMetadata(path, signal);
        return {
          ...metadata,
          cover: metadata.cover ? await thumbnail(metadata.cover, signal) : null,
        };
      } finally {
        active -= 1;
        waiting.shift()?.start();
      }
    },
  });
}

type LibraryArtwork = ReturnType<typeof createLibraryArtwork>;
export function provideLibraryArtwork() {
  const cache = createLibraryArtwork();
  setContext(KEY, cache);
  onDestroy(() => cache.dispose());
}
export function getLibraryArtwork() {
  return getContext<LibraryArtwork>(KEY);
}
