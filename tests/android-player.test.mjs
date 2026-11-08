import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import { compileModule } from "svelte/compiler";
import ts from "typescript";

const url = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const stub = code => url(`const h = () => globalThis.__androidPlayerTest; ${code}`);
function compile(path, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  });
  let code = compileModule(outputText, { filename: path.replace(/\.ts$/, ".js"), generate: "client" }).js.code;
  for (const [name, replacement] of Object.entries({ "svelte/internal/client": import.meta.resolve("svelte/internal/client"), ...imports })) {
    code = code.replaceAll(`"${name}"`, JSON.stringify(replacement)).replaceAll(`'${name}'`, JSON.stringify(replacement));
  }
  return url(code);
}
const order = compile("../src/lib/playback-order.svelte.ts");
const { createPlayer } = await import(compile("../src/lib/player.svelte.ts", {
  svelte: stub("export const onMount = callback => { h().mount = callback; };"),
  "@tauri-apps/api/core": stub("export const isTauri = () => true;"),
  "@tauri-apps/api/window": stub("export const getCurrentWindow = () => { throw new Error('Android must not register desktop window hooks'); };"),
  "./shortcuts": stub("export const registerPlayerShortcuts = actions => { h().shortcuts = actions; return () => {}; };"),
  "./settings": stub(`
    export const loadSettings = () => ({ volume: .6, repeatMode: "off", shuffle: false });
    export const saveSettings = value => { h().settings = value; };
  `),
  "./library": stub(`
    export const pathKey = path => path;
    export const pickTracks = async () => { h().pickCalls++; return h().picked ?? []; };
    export const loadLibrary = () => structuredClone(h().library);
    export const saveLibrary = value => { h().saved = JSON.parse(JSON.stringify(value)); return true; };
  `),
  "./audio": stub(`
    export const nativeAudio = {
      setContext(tracks) { h().contexts.push(tracks.map(track => track.path)); },
      connect() { return h().connection ?? Promise.resolve(h().nativeState); },
      syncQueue(tracks) { h().queueSyncs.push(tracks.map(track => track.path)); },
      onState(callback) { h().onNativeState = callback; callback(h().nativeState); return () => { h().onNativeState = null; h().nativeUnsubscribed++; }; },
      setOptions(shuffle,repeatMode) { h().options.push({shuffle,repeatMode}); },
      next() { h().next++; }, previous() { h().previous++; },
      refresh() { h().refreshes++; return Promise.resolve(); },
    };
    export const loadAudio = (path,position) => { h().loaded.push({path,position}); };
    export const unloadAudio = () => { h().unloaded++; };
    export const playAudio = () => { h().plays++; return Promise.resolve(); };
    export const pauseAudio = () => { h().pauses++; };
    export const setVolume = value => { h().volume = value; };
    export const seekTo = value => { h().progress.currentTime = value; };
    export const getAudioProgress = () => ({...h().progress});
    export const onAudioProgress = callback => { h().onProgress = callback; callback(h().progress); return () => { h().onProgress = null; }; };
    export const onAudioEnded = callback => { h().onEnded = callback; return () => {}; };
    export const onAudioError = callback => { h().onError = callback; return () => {}; };
  `),
  "./playback-order.svelte": order,
  "./runtime": stub("export const isDesktopRuntime = () => false;"),
}));

let cleanup;
afterEach(() => {
  cleanup?.(); cleanup = undefined;
  delete globalThis.__androidPlayerTest;
  delete globalThis.window;
  delete globalThis.document;
});
function setup(overrides = {}) {
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  document.visibilityState = "visible";
  const tracks = ["a", "b", "c"].map(id => ({ id, title: id, path: `content://music/${id}` }));
  const h = globalThis.__androidPlayerTest = {
    library: { tracks, currentTrackId: "a", position: 5 },
    nativeState: { path: tracks[1].path, index: 1, position: 37, duration: 120, playing: true, buffering: false,
      ended: false, error: null, revision: 4, canNext: true, canPrevious: false, shuffle: true, repeatMode: "all" },
    progress: { currentTime: 37, duration: 120 },
    contexts: [], queueSyncs: [], options: [], loaded: [], pickCalls: 0, plays: 0, pauses: 0, unloaded: 0,
    next: 0, previous: 0, refreshes: 0, nativeUnsubscribed: 0,
    ...overrides,
  };
  h.emit = state => {
    h.nativeState = { ...h.nativeState, ...state };
    h.progress = { currentTime: h.nativeState.position, duration: h.nativeState.duration };
    h.onNativeState?.(h.nativeState);
  };
  const player = createPlayer();
  cleanup = h.mount();
  return { player, h };
}
const settle = async () => { for (let step = 0; step < 5; step++) await Promise.resolve(); };

test("a running native service rehydrates its current track without loading or pausing audio", async () => {
  const { player, h } = setup();
  assert.equal(player.isReady, false);
  await settle();
  assert.equal(player.isReady, true);
  assert.equal(player.currentTrack.id, "b");
  assert.equal(player.displayTime, 37);
  assert.equal(player.duration, 120);
  assert.equal(player.isPlaying, true);
  assert.equal(player.isShuffling, true);
  assert.equal(player.repeatMode, "all");
  assert.equal(player.canNext, true);
  assert.equal(player.canPrevious, false);
  assert.deepEqual(h.loaded, []);
  assert.deepEqual(h.options, []);
  assert.equal(h.pauses, 0);
  assert.deepEqual(h.contexts, [["content://music/a", "content://music/b", "content://music/c"]]);
});

test("remote native transitions update track, position, controls and playback state", async () => {
  const { player, h } = setup();
  await settle();
  h.emit({ path: "content://music/c", index: 2, position: 9, duration: 150, playing: false,
    canNext: false, canPrevious: true, shuffle: false, repeatMode: "off", revision: 5 });
  assert.equal(player.currentTrack.id, "c");
  assert.equal(player.displayTime, 9);
  assert.equal(player.duration, 150);
  assert.equal(player.isPlaying, false);
  assert.equal(player.canNext, false);
  assert.equal(player.canPrevious, true);
  assert.equal(player.isShuffling, false);
  assert.equal(player.repeatMode, "off");
  assert.equal(typeof player.library.find(track => track.id === "c").lastPlayedAt, "number");
  assert.deepEqual(h.loaded, []);
  h.emit({ playing: true, position: 10, revision: 6 });
  assert.equal(player.isPlaying, true);
});

test("Android Next, Previous and ended events leave queue transitions with the service", async () => {
  const { player, h } = setup();
  await settle();
  player.nextTrack(); player.previousTrack(); h.onEnded();
  assert.equal(h.next, 1);
  assert.equal(h.previous, 1);
  assert.deepEqual(h.loaded, []);
  assert.equal(h.plays, 0);
  assert.equal(player.currentTrack.id, "b");
});

test("a native connection that resolves after disposal cannot reload or subscribe", async () => {
  let resolve;
  const connection = new Promise(yes => { resolve = yes; });
  const { player, h } = setup({ connection });
  cleanup(); cleanup = undefined;
  resolve(h.nativeState);
  await settle();
  assert.equal(player.currentTrack, null);
  assert.equal(h.onNativeState, undefined);
  assert.deepEqual(h.loaded, []);
  assert.deepEqual(h.options, []);
  assert.equal(h.unloaded, 0);
  assert.equal(h.pauses, 0);
});

test("saving background state and component teardown preserve native playback", async () => {
  const { player, h } = setup();
  await settle();
  player.savePlaybackState();
  assert.equal(h.saved.currentTrackId, "b");
  assert.equal(h.saved.position, 37);
  assert.equal(h.pauses, 0);
  document.visibilityState = "hidden";
  document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(h.refreshes, 0);
  document.visibilityState = "visible";
  document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(h.refreshes, 1);
  cleanup(); cleanup = undefined;
  assert.equal(h.nativeUnsubscribed, 1);
  assert.equal(h.nativeState.playing, true);
  assert.equal(h.unloaded, 0);
  assert.equal(h.pauses, 0);
  assert.equal(h.saved.currentTrackId, "b");
});

test("native connection failure keeps imports unavailable and reports a recovery message", async () => {
  const { player, h } = setup({ connection: Promise.reject(new Error("Service unavailable")) });
  await settle();
  assert.equal(player.isReady, false);
  assert.match(player.playbackError, /Could not connect to Android playback/);
  assert.equal(await player.chooseFiles(), null);
  assert.equal(h.pickCalls, 0);
  assert.deepEqual(h.loaded, []);
});
