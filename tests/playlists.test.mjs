import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import { compileModule } from "svelte/compiler";
import * as client from "svelte/internal/client";
import ts from "typescript";

const url = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
let code = compileModule(ts.transpileModule(
  readFileSync(new URL("../src/lib/playlists.svelte.ts", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } },
).outputText, { filename: "playlists.svelte.js", generate: "client" }).js.code;
for (const [name, value] of Object.entries({
  "svelte/internal/client": import.meta.resolve("svelte/internal/client"),
  svelte: url("export const onMount = fn => { globalThis.__playlistTest.mount = fn; };"),
})) code = code.replaceAll(`"${name}"`, JSON.stringify(value)).replaceAll(`'${name}'`, JSON.stringify(value));
const { createPlaylists } = await import(url(code));
let cleanup;
afterEach(() => { cleanup?.(); cleanup = undefined; delete globalThis.__playlistTest; delete globalThis.localStorage; });
function setup(saved = null) {
  const entries = new Map(saved === null ? [] : [["kitto.playlists.v1", JSON.stringify(saved)]]);
  const harness = globalThis.__playlistTest = { fail: false };
  globalThis.localStorage = {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => { if (harness.fail) throw new Error("Quota"); entries.set(key, value); },
  };
  const ids = client.state(["a", "b", "c"]);
  let state;
  cleanup = client.effect_root(() => { state = createPlaylists(() => client.get(ids)); });
  client.flush();
  harness.mount();
  client.flush();
  return { state, entries, harness, setLibrary: next => { client.set(ids, next); client.flush(); } };
}

test("playlist lifecycle preserves membership order, supports rename, reorder and deletion", () => {
  const { state } = setup();
  const id = state.create("  Evening   music  ");
  assert.ok(id);
  assert.equal(state.playlists[0].name, "Evening music");
  state.addTracks(id, ["a", "a", "missing", "b"]);
  assert.deepEqual([...state.playlists[0].trackIds], ["a", "b"]);
  state.moveTrack(id, "b", -1);
  assert.deepEqual([...state.playlists[0].trackIds], ["b", "a"]);
  state.removeTrack(id, "b");
  assert.deepEqual([...state.playlists[0].trackIds], ["a"]);
  assert.equal(state.rename(id, "Renamed"), true);
  assert.equal(state.playlists[0].name, "Renamed");
  assert.equal(state.remove(id), true);
  assert.equal(state.playlists.length, 0);
});

test("old playlists migrate without losing IDs; removed library tracks are pruned", () => {
  const { state, setLibrary } = setup({
    version: 1, playlists: [
      { id: "p", name: "Old", trackIds: ["b", "a", "a", "missing"] },
      { id: "p", name: "Duplicate", trackIds: [] }, { invalid: true },
    ],
  });
  assert.equal(state.playlists.length, 1);
  assert.deepEqual([...state.playlists[0].trackIds], ["b", "a"]);
  setLibrary(["b"]);
  assert.deepEqual([...state.playlists[0].trackIds], ["b"]);
  assert.equal(state.playlists[0].id, "p");
});

test("storage failures keep the previously saved playlist and allow retry", () => {
  const { state, harness } = setup();
  const id = state.create("Keep");
  state.addTracks(id, ["a"]);
  harness.fail = true;
  assert.equal(state.rename(id, "Lost"), false);
  assert.equal(state.remove(id), false);
  assert.equal(state.playlists[0].name, "Keep");
  assert.deepEqual([...state.playlists[0].trackIds], ["a"]);
  assert.match(state.error, /save/);
  harness.fail = false;
  assert.equal(state.rename(id, "Saved"), true);
  assert.equal(state.error, "");
});

test("creating from a track saves membership together with the playlist", () => {
  const { state, entries } = setup();
  assert.equal(state.create("  "), null);
  assert.equal(state.create("x".repeat(81)), null);
  const id = state.create("Single", ["c", "c", "unknown"]);
  const saved = JSON.parse(entries.get("kitto.playlists.v1")).playlists;
  assert.equal(saved[0].id, id);
  assert.deepEqual(saved[0].trackIds, ["c"]);
});
