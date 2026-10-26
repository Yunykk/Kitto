import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import { compileModule } from "svelte/compiler";
import ts from "typescript";

const moduleUrl = (code) =>
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const stub = (code) => moduleUrl(`const h = () => globalThis.__kittoPlayerTest; ${code}`);

function compile(path, imports = {}) {
  const { outputText } = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } },
  );
  const { js } = compileModule(outputText, { filename: path.replace(/\.ts$/, ".js"), generate: "client" });
  let code = js.code;
  for (const [name, url] of Object.entries({
    "svelte/internal/client": import.meta.resolve("svelte/internal/client"),
    ...imports,
  })) {
    code = code.replaceAll(`"${name}"`, JSON.stringify(url));
    code = code.replaceAll(`'${name}'`, JSON.stringify(url));
  }
  return moduleUrl(code);
}

const order = compile("../src/lib/playback-order.svelte.ts");
const { createPlayer } = await import(compile("../src/lib/player.svelte.ts", {
  svelte: stub(`export const onMount = callback => { h().mount = callback; };`),
  "@tauri-apps/api/core": stub(`export const isTauri = () => true;`),
  "@tauri-apps/api/window": stub(`export const getCurrentWindow = () => ({ onCloseRequested: async () => () => {} });`),
  "./shortcuts": stub(`export const registerPlayerShortcuts = () => () => {};`),
  "./settings": stub(`
    export const loadSettings = () => ({ volume: 1, repeatMode: "off", shuffle: false });
    export const saveSettings = settings => { h().settings = settings; };
  `),
  "./library": stub(`
    export const pickTracks = async () => [];
    export const loadLibrary = () => structuredClone(h().library);
    export const saveLibrary = value => { h().saved = JSON.parse(JSON.stringify(value)); return true; };
  `),
  "./audio": stub(`
    export const loadAudio = (path, position) => {
      h().loaded.push(path);
      h().progress = { currentTime: position, duration: 60 };
      h().onProgress?.(h().progress);
    };
    export const unloadAudio = () => {};
    export const playAudio = () => {
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      h().requests.push({ resolve, reject });
      return promise;
    };
    export const pauseAudio = () => { h().pauses += 1; };
    export const setVolume = () => {};
    export const seekTo = position => { h().progress.currentTime = Math.max(0, Math.min(position, 60)); };
    export const getAudioProgress = () => ({ ...h().progress });
    export const onAudioProgress = callback => {
      h().onProgress = callback;
      callback(h().progress);
      return () => { h().onProgress = null; };
    };
    export const onAudioEnded = callback => { h().onEnded = callback; return () => {}; };
    export const onAudioError = callback => { h().onError = callback; return () => {}; };
  `),
  "./playback-order.svelte": order,
}));

let cleanup;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  delete globalThis.__kittoPlayerTest;
});

function setup() {
  globalThis.window = new EventTarget();
  const harness = globalThis.__kittoPlayerTest = {
    library: {
      tracks: ["a", "b"].map(id => ({ id, title: id, path: `${id}.wav` })),
      currentTrackId: "a",
      position: 0,
    },
    progress: { currentTime: 0, duration: 0 },
    loaded: [], requests: [], pauses: 0,
  };
  const player = createPlayer();
  cleanup = harness.mount();
  return { player, harness };
}

const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test("Play can be cancelled while the play promise is pending", async () => {
  const { player, harness } = setup();
  player.togglePlayback();
  assert.equal(player.isPlaying, true);
  player.togglePlayback();
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.pauses, 1);
  assert.equal(player.isPlaying, false);
  harness.requests[0].resolve();
  await settle();
  assert.equal(player.isPlaying, false);
});

test("removing a starting track continues playback with its replacement", () => {
  const { player, harness } = setup();
  player.togglePlayback();
  player.removeTrack("a");
  assert.equal(player.currentTrack.id, "b");
  assert.equal(harness.requests.length, 2);
  assert.equal(player.isPlaying, true);
});

test("a rejected old request cannot stop a newer playback request", async () => {
  const { player, harness } = setup();
  player.togglePlayback();
  player.playTrack(1);
  harness.requests[0].reject(new Error("Old request aborted"));
  await settle();
  assert.equal(player.playbackError, "");
  assert.equal(player.isPlaying, true);
  harness.requests[1].resolve();
  await settle();
  assert.equal(player.currentTrack.id, "b");
  assert.equal(player.isPlaying, true);
});

test("audio errors cancel pending playback even if its promise resolves later", async () => {
  const { player, harness } = setup();
  player.togglePlayback();
  harness.onError();
  assert.equal(player.isPlaying, false);
  harness.requests[0].resolve();
  await settle();
  assert.equal(player.isPlaying, false);
  assert.match(player.playbackError, /missing or unsupported/);
});

test("clearing the queue cancels pending playback", async () => {
  const { player, harness } = setup();
  player.togglePlayback();
  player.clearLibrary();
  harness.requests[0].resolve();
  await settle();
  assert.equal(player.currentTrack, null);
  assert.equal(player.isPlaying, false);
  assert.deepEqual(harness.saved.tracks, []);
});

test("a rejected current playback request returns to the paused state", async () => {
  const { player, harness } = setup();
  player.togglePlayback();
  harness.requests[0].reject(new Error("Unsupported audio"));
  await settle();
  assert.equal(player.isPlaying, false);
  assert.equal(player.playbackError, "Could not play this file.");
});

test("Repeat one restarts the current track without advancing the queue", async () => {
  const { player, harness } = setup();
  player.cycleRepeat();
  player.cycleRepeat();
  player.togglePlayback();
  harness.requests[0].resolve();
  await settle();
  harness.onEnded();
  assert.equal(player.currentTrack.id, "a");
  assert.equal(harness.progress.currentTime, 0);
  assert.equal(harness.requests.length, 2);
});
