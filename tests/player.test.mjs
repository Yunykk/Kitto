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
    export const pathKey = path => /^[a-z]:/i.test(path) ? path.replaceAll(String.fromCharCode(92), "/").toLowerCase() : path;
    export const pickTracks = async () => { if (h().pickError) throw new Error("Picker failed"); return h().picked ?? []; };
    export const loadLibrary = () => structuredClone(h().library);
    export const saveLibrary = value => { if (h().saveError) return false; h().saved = JSON.parse(JSON.stringify(value)); return true; };
  `),
  "./audio": stub(`
    export const nativeAudio = null;
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
  "./runtime": stub(`export const isDesktopRuntime = () => true;`),
}));

let cleanup;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  delete globalThis.__kittoPlayerTest;
});

function setup(overrides = {}) {
  globalThis.window = new EventTarget();
  const harness = globalThis.__kittoPlayerTest = {
    library: {
      tracks: ["a", "b"].map(id => ({ id, title: id, path: `${id}.wav` })),
      currentTrackId: "a",
      position: 0,
    },
    progress: { currentTime: 0, duration: 0 },
    loaded: [], requests: [], pauses: 0,
    ...overrides,
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

test("a playlist queue is a snapshot independent from the complete library", () => {
  const { player } = setup();
  const ids = ["b"];
  assert.equal(player.playCollection(ids, "Focus"), true);
  ids.push("a");
  assert.deepEqual(player.tracks.map(track => track.id), ["b"]);
  assert.deepEqual(player.library.map(track => track.id), ["a", "b"]);
  assert.equal(player.queueName, "Focus");
  assert.equal(player.canNext, false);
});

test("playlist file imports reuse canonical IDs and leave the playing queue unchanged", async () => {
  const { player, harness } = setup();
  player.playCollection(["b"], "Focus");
  harness.picked = [
    { id: "unused", title: "a", path: "a.wav" },
    { id: "c", title: "c", path: "c.wav" },
    { id: "duplicate", title: "c", path: "c.wav" },
  ];
  assert.deepEqual(await player.choosePlaylistFiles(), ["a", "c"]);
  assert.deepEqual(player.library.map(track => track.id), ["a", "b", "c"]);
  assert.deepEqual(player.tracks.map(track => track.id), ["b"]);
  assert.equal(harness.requests.length, 1);
  assert.deepEqual(harness.saved.queue.trackIds, ["b"]);
});

test("clearing or removing items from the queue does not delete library tracks", () => {
  const { player, harness } = setup();
  player.removeFromQueue("a");
  assert.deepEqual(player.tracks.map(track => track.id), ["b"]);
  assert.equal(player.library.length, 2);
  player.clearQueue();
  assert.equal(player.tracks.length, 0);
  assert.equal(player.library.length, 2);
  assert.equal(player.currentTrack, null);
  assert.deepEqual(harness.saved.queue.trackIds, []);
  assert.equal(harness.saved.tracks.length, 2);
});

test("a saved playlist queue restores its order and position without autoplay", () => {
  const { player, harness } = setup({ library: {
    tracks: ["a", "b", "c"].map(id => ({ id, title: id, path: id + ".wav" })),
    currentTrackId: "b", position: 17,
    queue: { trackIds: ["c", "b"], name: "Focus", isLibrary: false },
  } });
  assert.deepEqual(player.tracks.map(track => track.id), ["c", "b"]);
  assert.equal(player.library.length, 3);
  assert.equal(player.currentTrack.id, "b");
  assert.equal(player.displayTime, 17);
  assert.equal(harness.requests.length, 0);
});

test("a saved empty queue stays empty while the library remains available", () => {
  const { player } = setup({ library: {
    tracks: [{ id: "a", title: "a", path: "a.wav" }], currentTrackId: null, position: 0,
    queue: { trackIds: [], name: "Queue", isLibrary: false },
  } });
  assert.equal(player.library.length, 1);
  assert.equal(player.tracks.length, 0);
});

test("cancelled and failed imports return distinct results and reset the busy state", async () => {
  const { player, harness } = setup();
  assert.deepEqual(await player.chooseFiles(), []);
  harness.pickError = true;
  assert.equal(await player.chooseFiles(), null);
  assert.equal(player.isChoosingFiles, false);
  harness.pickError = false;
  harness.saveError = true;
  harness.picked = [{ id: "c", title: "c", path: "c.wav" }];
  assert.equal(await player.choosePlaylistFiles(), null);
  assert.match(player.playbackError, /save your library/);
});

test("Next, repeat, and manual Music selection use the active queue", () => {
  const { player } = setup();
  player.playCollection(["b"], "Focus");
  player.cycleRepeat();
  player.nextTrack();
  assert.equal(player.currentTrack.id, "b");
  player.playLibraryTrack("a");
  assert.deepEqual(player.tracks.map(track => track.id), ["a", "b"]);
  assert.equal(player.queueName, "Music");
  player.nextTrack();
  assert.equal(player.currentTrack.id, "b");
});

test("an unreadable library is not overwritten or treated as ready for playlist cleanup", async () => {
  const { player, harness } = setup({ library: {
    tracks: [], currentTrackId: null, position: 0, readError: true,
  } });
  assert.equal(player.isReady, false);
  assert.match(player.playbackError, /saved data was kept/);
  assert.equal(await player.chooseFiles(), null);
  assert.equal(harness.saved, undefined);
});
