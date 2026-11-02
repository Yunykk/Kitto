import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import ts from "typescript";
const url = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
let code = ts.transpileModule(readFileSync(new URL("../src/lib/library.ts", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }).outputText;
code = code.replace('"@tauri-apps/api/core"', JSON.stringify(url("export const isTauri = () => true;")))
  .replace('"@tauri-apps/plugin-dialog"', JSON.stringify(url("export const open = async () => null;")));
const { loadLibrary, pathKey, saveLibrary } = await import(url(code));
afterEach(() => { delete globalThis.localStorage; });
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
