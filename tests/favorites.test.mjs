import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import { compileModule } from "svelte/compiler";
import ts from "typescript";

const url = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
let code = compileModule(ts.transpileModule(
  readFileSync(new URL("../src/lib/favorites.svelte.ts", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } },
).outputText, { filename: "favorites.svelte.js", generate: "client" }).js.code;
for (const [name, value] of Object.entries({
  "svelte/internal/client": import.meta.resolve("svelte/internal/client"),
  svelte: url("export const onMount = fn => { globalThis.__favoritesTest.mount = fn; };"),
})) code = code.replaceAll(`"${name}"`, JSON.stringify(value)).replaceAll(`'${name}'`, JSON.stringify(value));
const { createFavorites } = await import(url(code));

afterEach(() => {
  delete globalThis.__favoritesTest;
  delete globalThis.localStorage;
});
function setup(saved = null) {
  const entries = new Map(saved === null ? [] : [["kitto.favorites.v1", JSON.stringify(saved)]]);
  const harness = globalThis.__favoritesTest = { fail: false };
  globalThis.localStorage = {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => { if (harness.fail) throw new Error("Quota"); entries.set(key, value); },
  };
  return { state: createFavorites(), entries, harness };
}
test("favorites exposes readiness and allows toggling only after restore", () => {
  const { state, harness, entries } = setup();
  assert.equal(state.isReady, false);
  assert.equal(state.toggle("a"), false);
  harness.mount();
  assert.equal(state.isReady, true);
  assert.equal(state.toggle("a"), true);
  assert.equal(state.has("a"), true);
  assert.deepEqual([...state.ids], ["a"]);
  assert.equal(JSON.parse(entries.get("kitto.favorites.v1")).entries[0].trackId, "a");
  state.toggle("a");
  assert.equal(state.has("a"), false);
});
test("favorites restores unique valid records and keeps placement when pruning", () => {
  const { state, harness, entries } = setup({
    version: 1, separateTab: true, entries: [
      { trackId: "a", likedAt: 0 }, { trackId: "b", likedAt: 10 },
      { trackId: "a", likedAt: 5 }, { trackId: "bad", likedAt: -1 },
    ],
  });
  harness.mount();
  assert.deepEqual([...state.ids], ["b", "a"]);
  assert.equal(state.separateTab, true);
  state.prune(["a"]);
  assert.deepEqual([...state.ids], ["a"]);
  assert.equal(JSON.parse(entries.get("kitto.favorites.v1")).separateTab, true);
});
test("failed favorites saves preserve the previous state and placement", () => {
  const { state, harness } = setup();
  harness.mount();
  state.toggle("a");
  harness.fail = true;
  assert.equal(state.toggle("a"), false);
  assert.equal(state.setSeparateTab(true), false);
  assert.equal(state.has("a"), true);
  assert.equal(state.separateTab, false);
  assert.match(state.error, /save/);
});
