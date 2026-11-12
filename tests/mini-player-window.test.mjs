import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import { compileModule } from "svelte/compiler";
import ts from "typescript";

const url = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
let code = ts.transpileModule(readFileSync(new URL("../src/lib/mini-player-window.svelte.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
}).outputText;
code = compileModule(code, { filename: "mini-player-window.svelte.js", generate: "client" }).js.code;
const imports = {
  svelte: url("export const onMount = fn => { globalThis.__miniTest.mount = fn; };"),
  "svelte/internal/client": import.meta.resolve("svelte/internal/client"),
  "@tauri-apps/api/dpi": url("export class LogicalSize { constructor(width,height) { this.width=width; this.height=height; } }"),
  "@tauri-apps/api/window": url("export const getCurrentWindow = () => globalThis.__miniTest.window;"),
  "./runtime": url("export const isDesktopRuntime = () => globalThis.__miniTest.desktop;"),
};
for (const [name, replacement] of Object.entries(imports)) {
  code = code.replaceAll(JSON.stringify(name), JSON.stringify(replacement)).replaceAll(`'${name}'`, JSON.stringify(replacement));
}
const { createMiniPlayerWindow } = await import(url(code));
const key = "kitto.mini.restore.v1";
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function setup({ desktop = true, maximized = false, fullscreen = false, saved = null } = {}) {
  const entries = new Map(saved ? [[key, saved]] : []);
  const h = globalThis.__miniTest = { desktop, size: { width: 1100, height: 820 }, pinned: false, maximized, fullscreen, calls: [], failResize: false };
  globalThis.localStorage = {
    getItem: name => entries.get(name) ?? null,
    setItem: (name, value) => entries.set(name, value),
    removeItem: name => entries.delete(name),
  };
  h.window = {
    innerSize: async () => ({ width: h.size.width * 2, height: h.size.height * 2 }),
    scaleFactor: async () => 2,
    isMaximized: async () => h.maximized,
    isFullscreen: async () => h.fullscreen,
    isAlwaysOnTop: async () => h.pinned,
    setFullscreen: async value => { h.fullscreen = value; },
    unmaximize: async () => { h.maximized = false; h.size = { width: 1000, height: 700 }; },
    maximize: async () => { h.maximized = true; },
    setMinSize: async value => { h.minimum = value; },
    setSize: async value => {
      if (h.failResize) { h.failResize = false; throw new Error("Resize failed"); }
      assert.equal(h.maximized, false);
      assert.equal(h.fullscreen, false);
      h.calls.push([value.width, value.height]);
      h.size = { width: value.width, height: value.height };
    },
    setAlwaysOnTop: async value => { h.pinned = value; },
  };
  const state = createMiniPlayerWindow();
  return { h, state, entries, mount: async () => { h.cleanup = h.mount(); await tick(); } };
}

afterEach(() => {
  globalThis.__miniTest?.cleanup?.();
  delete globalThis.__miniTest;
  delete globalThis.localStorage;
});

test("mini player can resize, unpin and return to its original logical size", async () => {
  const { state, h, entries, mount } = setup();
  await mount();
  assert.equal(await state.enter(), true);
  assert.equal(state.isMini, true);
  assert.equal(h.minimum.height, 240);
  assert.deepEqual(h.size, { width: 360, height: 440 });
  assert.equal(h.pinned, true);
  assert.equal(await state.togglePin(), true);
  assert.equal(h.pinned, false);
  h.size = { width: 560, height: 280 };
  assert.equal(await state.leave(), true);
  assert.deepEqual(h.size, { width: 1100, height: 820 });
  assert.equal(h.minimum.height, 560);
  assert.equal(entries.has(key), false);
  await state.enter();
  assert.deepEqual(h.size, { width: 560, height: 280 });
});

test("maximized and fullscreen windows leave those modes before shrinking and restore them", async () => {
  const { state, h, mount } = setup({ maximized: true, fullscreen: true });
  await mount();
  await state.enter();
  assert.equal(h.maximized, false);
  assert.equal(h.fullscreen, false);
  await state.leave();
  assert.deepEqual(h.size, { width: 1000, height: 700 });
  assert.equal(h.maximized, true);
  assert.equal(h.fullscreen, true);
});

test("a failed resize rolls back geometry and clears recovery after restoration", async () => {
  const { state, h, entries, mount } = setup();
  await mount();
  h.failResize = true;
  assert.equal(await state.enter(), false);
  assert.equal(state.isMini, false);
  assert.equal(state.isBusy, false);
  assert.match(state.error, /Resize failed/);
  assert.deepEqual(h.size, { width: 1100, height: 820 });
  assert.equal(entries.has(key), false);
});

test("closing in mini mode recovers full geometry on the next launch", async () => {
  const saved = JSON.stringify({ version: 1, width: 1200, height: 800, maximized: false, fullscreen: false, pinned: true });
  const { state, h, entries, mount } = setup({ saved });
  await mount();
  assert.equal(state.isReady, true);
  assert.equal(state.isMini, false);
  assert.deepEqual(h.size, { width: 1200, height: 800 });
  assert.equal(h.pinned, true);
  assert.equal(entries.has(key), false);
});

test("Android and browsers do not call desktop window commands", async () => {
  const { state, h, mount } = setup({ desktop: false });
  await mount();
  assert.equal(state.supported, false);
  assert.equal(await state.enter(), false);
  assert.equal(await state.leave(), false);
  assert.equal(await state.togglePin(), false);
  assert.deepEqual(h.calls, []);
});
