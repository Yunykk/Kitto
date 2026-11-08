import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import ts from "typescript";
const url = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
let code = ts.transpileModule(readFileSync(new URL("../src/lib/library.ts", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }).outputText;
code = code.replace('"@tauri-apps/api/core"', JSON.stringify(url("export const isTauri = () => true;")))
  .replace('"@tauri-apps/plugin-dialog"', JSON.stringify(url("export const open = async () => { globalThis.__desktopPickerCalls = (globalThis.__desktopPickerCalls || 0) + 1; return globalThis.__librarySelection ?? null; };")))
  .replace('"./android-bridge"', JSON.stringify(url(`
    export const isAndroidAudio = () => globalThis.__androidLibrary === true;
    export const androidRequest = async command => {
      globalThis.__androidLibraryCommand = command;
      if (globalThis.__androidLibraryError) throw globalThis.__androidLibraryError;
      return globalThis.__androidLibraryResult ?? { documents: [] };
    };
  `)));
const mediaCode = ts.transpileModule(readFileSync(new URL("../src/lib/media-location.ts", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }).outputText;
code = code.replace('"./media-location"', JSON.stringify(url(mediaCode)));
const { loadLibrary, pathKey, saveLibrary, pickTracks } = await import(url(code));
afterEach(() => {
  for (const key of ["localStorage", "__librarySelection", "__androidLibrary", "__androidLibraryCommand", "__androidLibraryResult", "__androidLibraryError", "__desktopPickerCalls"]) delete globalThis[key];
});
test("path keys deduplicate Windows paths without changing Linux case semantics", () => {
  assert.equal(pathKey("C:\\Music\\Song.mp3"), pathKey("c:/music/song.mp3"));
  assert.notEqual(pathKey("/Music/Song.mp3"), pathKey("/music/song.mp3"));
});
test("legacy libraries remain readable and queue snapshots discard missing IDs", () => {
  let data = {
    tracks: [{ id: "a", title: "A", path: "C:/a.mp3" }, { id: "b", title: "B", path: "C:/b.mp3" }],
    currentTrackId: "b", position: 13,
  };
  globalThis.localStorage = { getItem: () => JSON.stringify(data) };
  assert.equal(loadLibrary().queue, undefined);
  data.queue = { trackIds: ["b", "b", "missing", "a"], name: "Focus", isLibrary: false };
  const saved = loadLibrary();
  assert.deepEqual(saved.queue.trackIds, ["b", "a"]);
  assert.equal(saved.position, 13);
  assert.equal(saved.tracks.length, 2);
});
test("malformed storage and write failures are handled without throwing", () => {
  globalThis.localStorage = { getItem: () => "{bad", setItem: () => { throw new Error("Quota"); } };
  assert.deepEqual(loadLibrary().tracks, []);
  assert.equal(loadLibrary().readError, true);
  assert.equal(saveLibrary({ tracks: [], currentTrackId: null, position: 0 }), false);
});

test("cancelled desktop picker remains empty and does not accept Android document URIs", async () => {
  assert.deepEqual(await pickTracks(), []);
  globalThis.__librarySelection = ["content://com.android.providers.media.documents/document/audio%3A12"];
  await assert.rejects(pickTracks(), /must be imported through the Android app/);
  globalThis.__librarySelection = ["C:/Music/good.mp3", "content://provider/song"];
  await assert.rejects(pickTracks(), /No files were added/);
});

test("Android uses the persistent document picker and preserves provider display names", async () => {
  globalThis.__androidLibrary = true;
  globalThis.__androidLibraryResult = { documents: [
    { uri: "content://provider/document/audio%3A12", name: "Пісня #100% — live.flac" },
    { uri: "content://provider/document/audio%3A12", name: "Duplicate name.flac" },
    { uri: "content://provider/document/Audio%3A12", name: "Other.mp3" },
  ] };
  const tracks = await pickTracks();
  assert.equal(globalThis.__androidLibraryCommand, "pickDocuments");
  assert.equal(globalThis.__desktopPickerCalls, undefined);
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].path, "content://provider/document/audio%3A12");
  assert.equal(tracks[0].title, "Пісня #100% — live.flac");
  assert.equal(tracks[1].title, "Other.mp3");
  assert.notEqual(tracks[0].id, tracks[1].id);
  assert.equal(typeof tracks[0].addedAt, "number");
});

test("Android picker cancellation stays empty and permission errors propagate", async () => {
  globalThis.__androidLibrary = true;
  assert.deepEqual(await pickTracks(), []);
  globalThis.__androidLibraryError = new Error("The document provider did not grant permanent read access.");
  await assert.rejects(pickTracks(), /permanent read access/);
});

test("invalid Android document selections fail as a whole", async () => {
  globalThis.__androidLibrary = true;
  globalThis.__androidLibraryResult = { documents: [
    { uri: "content://provider/a", name: "Good.mp3" },
    { uri: "/storage/emulated/0/private.mp3", name: "Unselected.mp3" },
  ] };
  await assert.rejects(pickTracks(), /No files were added/);
  globalThis.__androidLibraryResult = { documents: null };
  await assert.rejects(pickTracks(), /No files were added/);
});

test("Android document locations survive library round trips without path rewriting", async () => {
  globalThis.__androidLibrary = true;
  globalThis.__androidLibraryResult = { documents: [{ uri: "content://provider/document/a%2Fb%3A1", name: "One.mp3" }] };
  const tracks = await pickTracks();
  let saved;
  globalThis.localStorage = { setItem: (_key, value) => { saved = value; }, getItem: () => saved };
  assert.equal(saveLibrary({ tracks, currentTrackId: tracks[0].id, position: 7 }), true);
  assert.equal(loadLibrary().tracks[0].path, tracks[0].path);
  assert.equal(loadLibrary().position, 7);
});

test("desktop imports retain filenames and canonical deduplication", async () => {
  globalThis.__librarySelection = ["C:/Music/Song.mp3", "c:/music/song.mp3", "/Music/Other.flac"];
  const tracks = await pickTracks();
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].title, "Song.mp3");
  assert.equal(tracks[1].title, "Other.flac");
  assert.notEqual(tracks[0].id, tracks[1].id);
});

test("Linux imports preserve case, backslashes and Unicode in filenames", async () => {
  globalThis.__librarySelection = ["/home/me/Music/Track.mp3", "/home/me/Music/track.mp3", "/home/me/Music/artist\\live #100% — пісня.flac"];
  const tracks = await pickTracks();
  assert.equal(tracks.length, 3);
  assert.equal(tracks[2].title, "artist\\live #100% — пісня.flac");
  assert.equal(tracks[2].path, globalThis.__librarySelection[2]);
  assert.equal(pathKey(tracks[2].path), tracks[2].path);
});
