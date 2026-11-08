import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import { compileModule } from "svelte/compiler";
import ts from "typescript";

const url = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const transpile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
}).outputText;
const model = url(transpile("../src/lib/listening.ts"));
const { emptyListeningData, recordListening } = await import(model);
let code = compileModule(transpile("../src/lib/listening.svelte.ts"), { filename: "listening.svelte.js", generate: "client" }).js.code;
for (const [name, value] of Object.entries({
  "./listening": model,
  "svelte/internal/client": import.meta.resolve("svelte/internal/client"),
  svelte: url("export const onMount = fn => { globalThis.__listeningTest.mount = fn; };"),
})) code = code.replaceAll(`"${name}"`, JSON.stringify(value)).replaceAll(`'${name}'`, JSON.stringify(value));
const { createListeningStats } = await import(url(code));
const key = "kitto.listening.v1";
const credit = {
  sessionId: "a", track: { id: "a", title: "Sunrise", artist: "Artist", album: null },
  seconds: 30, qualified: true, at: Date.now(), startedAt: Date.now() - 30000,
};

afterEach(() => {
  globalThis.__listeningTest?.cleanup?.();
  delete globalThis.__listeningTest;
  delete globalThis.localStorage;
  delete globalThis.window;
});
function setup(saved = null) {
  const entries = new Map(saved === null ? [] : [[key, saved]]);
  const harness = globalThis.__listeningTest = { fail: false, writes: 0 };
  globalThis.window = new EventTarget();
  globalThis.localStorage = {
    getItem: (name) => entries.get(name) ?? null,
    setItem: (name, value) => {
      if (harness.fail) throw new Error("Quota");
      harness.writes++; entries.set(name, value);
    },
  };
  const state = createListeningStats();
  return { state, entries, harness, mount: () => { harness.cleanup = harness.mount(); } };
}

test("listening state restores before writes and saves pending progress on pagehide", () => {
  const saved = recordListening(emptyListeningData(), credit);
  const { state, entries, harness, mount } = setup(JSON.stringify(saved));
  state.record({ ...credit, sessionId: "ignored" });
  assert.equal(state.isReady, false);
  assert.equal(harness.writes, 0);
  mount();
  assert.equal(state.summary.totals.plays, 1);
  state.record({ ...credit, sessionId: "b" });
  assert.equal(harness.writes, 0);
  window.dispatchEvent(new Event("pagehide"));
  assert.equal(JSON.parse(entries.get(key)).plays, 2);
});

test("corrupt listening data is preserved until explicit successful reset", () => {
  const { state, entries, mount } = setup("{broken"); mount();
  assert.equal(state.isReady, true);
  assert.match(state.error, /Saved data was kept/);
  state.record(credit); state.flush();
  assert.equal(entries.get(key), "{broken");
  assert.equal(state.clear(), true);
  state.record(credit); state.flush();
  assert.equal(JSON.parse(entries.get(key)).plays, 1);
  assert.equal(state.error, "");
});

test("failed persistence retains live stats and retries without duplicating listens", () => {
  const { state, entries, harness, mount } = setup(); mount();
  state.record(credit);
  harness.fail = true; state.flush();
  assert.equal(state.summary.totals.seconds, 30);
  assert.match(state.error, /could not be saved/);
  harness.fail = false; state.flush();
  assert.equal(JSON.parse(entries.get(key)).seconds, 30);
  assert.equal(state.error, "");
});

test("reset preserves stats on failure and notifies active listening only on success", () => {
  const { state, harness, mount } = setup(); mount();
  state.record(credit);
  let resets = 0;
  const remove = state.onReset(() => resets++);
  harness.fail = true;
  assert.equal(state.clear(), false);
  assert.equal(state.summary.totals.plays, 1);
  assert.equal(resets, 0);
  harness.fail = false;
  assert.equal(state.clear(), true);
  assert.equal(state.summary.totals.seconds, 0);
  assert.equal(resets, 1);
  remove(); state.clear();
  assert.equal(resets, 1);
});

test("library availability affects replay controls without deleting historical totals", () => {
  const { state, mount } = setup(); mount(); state.record(credit);
  state.setAvailableTracks(["a"]);
  assert.equal(state.summary.topTracks[0].available, true);
  state.setAvailableTracks([]);
  assert.equal(state.summary.topTracks[0].available, false);
  assert.equal(state.summary.recent[0].available, false);
  assert.equal(state.summary.totals.plays, 1);
});
