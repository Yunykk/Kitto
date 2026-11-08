import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import ts from "typescript";

const url = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
function compile(path, imports = {}) {
  let code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  }).outputText;
  for (const [name, value] of Object.entries(imports)) code = code.replaceAll(`"${name}"`, JSON.stringify(value));
  return url(code);
}
const runtimeUrl = compile("../src/lib/runtime.ts", { "@tauri-apps/api/core": url("export const isTauri = () => true;") });
const { detectRuntimePlatform } = await import(runtimeUrl);
const { isContentUri, requirePlayablePaths } = await import(compile("../src/lib/media-location.ts"));
const { dismissTopLayer, registerAndroidBack } = await import(compile("../src/lib/mobile-back.ts", {
  "./runtime": url("export const runtimePlatform = () => globalThis.__mobileTest.platform;"),
  "./android-bridge": url("export const androidRequest = async command => { globalThis.__mobileTest.events.push(command); };"),
  "@tauri-apps/api/app": url(`
    export const exit = async () => { globalThis.__mobileTest.events.push("exit"); };
    export const onBackButtonPress = callback => {
      const h = globalThis.__mobileTest; h.callback = callback;
      const listener = { unregister: async () => { h.unregistered++; } };
      return h.delayed ? new Promise(resolve => { h.resolve = () => resolve(listener); }) : Promise.resolve(listener);
    };
  `),
}));

afterEach(() => {
  delete globalThis.__mobileTest;
  delete globalThis.document;
  delete globalThis.window;
});

function doc(dialogs = [], popovers = [], focused = null) {
  return {
    querySelectorAll: (selector) => selector === "[popover]" ? popovers : dialogs,
    activeElement: focused ? { closest: () => focused } : null,
    defaultView: { Event },
  };
}
function dialog() {
  const element = new EventTarget();
  element.closed = 0;
  element.close = () => element.closed++;
  return element;
}
function setup(options = {}) {
  const h = globalThis.__mobileTest = { platform: "android", events: [], unregistered: 0, ...options };
  globalThis.document = doc();
  globalThis.window = { history: { back: () => h.events.push("history") } };
  return h;
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test("runtime detection uses the build target and keeps browser previews distinct", () => {
  assert.equal(detectRuntimePlatform(false, "android", "Android"), "browser");
  assert.equal(detectRuntimePlatform(true, "android", "Windows"), "android");
  assert.equal(detectRuntimePlatform(true, "windows", "Android"), "desktop");
  assert.equal(detectRuntimePlatform(true, "", "Mozilla Android 15"), "android");
  assert.equal(detectRuntimePlatform(true, "ios"), "ios");
  assert.equal(detectRuntimePlatform(true, "", "iPhone"), "ios");
  assert.equal(detectRuntimePlatform(true), "desktop");
});

test("Android URI guards are narrow and do not mistake normal paths for documents", () => {
  assert.equal(isContentUri("CONTENT://provider/a"), true);
  assert.equal(isContentUri("C:/Music/content.mp3"), false);
  assert.equal(isContentUri("/music/content:/a.mp3"), false);
  assert.doesNotThrow(() => requirePlayablePaths(["C:/a.mp3", "/music/b.flac"]));
  assert.throws(() => requirePlayablePaths(["content://provider/a"]), /No files were added/);
});

test("Back dismisses a visible popover before touching its parent dialog", () => {
  const parent = dialog(); let hidden = 0;
  const popover = { matches: () => true, hidePopover: () => hidden++ };
  assert.equal(dismissTopLayer(doc([parent], [popover], parent)), true);
  assert.equal(hidden, 1);
  assert.equal(parent.closed, 0);
});

test("Back sends cancellable cancel to the focused dialog and honors controlled close", () => {
  const parent = dialog(), confirmation = dialog(); let cancelled = 0;
  confirmation.addEventListener("cancel", event => { cancelled++; event.preventDefault(); });
  assert.equal(dismissTopLayer(doc([confirmation, parent], [], confirmation)), true);
  assert.equal(cancelled, 1);
  assert.equal(parent.closed, 0);
  assert.equal(confirmation.closed, 0);
  assert.equal(dismissTopLayer(doc([parent])), true);
  assert.equal(parent.closed, 1);
});

test("Back tolerates older popover selectors and empty overlay stacks", () => {
  const popover = { matches: () => { throw new Error("Unsupported selector"); } };
  assert.equal(dismissTopLayer(doc([], [popover])), false);
});

test("root Android Back flushes state and backgrounds the activity without stopping audio", async () => {
  const h = setup();
  let navigated = true;
  const cleanup = registerAndroidBack({ navigate: () => navigated, beforeExit: () => h.events.push("flush") });
  await settle();
  h.callback({ canGoBack: false });
  assert.deepEqual(h.events, []);
  navigated = false;
  h.callback({ canGoBack: true });
  assert.deepEqual(h.events, ["history"]);
  h.callback({ canGoBack: false });
  assert.deepEqual(h.events, ["history", "flush", "background"]);
  cleanup(); cleanup();
  assert.equal(h.unregistered, 1);
});

test("desktop never registers Android Back and late registrations are cleaned up", async () => {
  const desktop = setup({ platform: "desktop" });
  registerAndroidBack({ navigate: () => false, beforeExit: () => {} })();
  assert.equal(desktop.callback, undefined);
  const h = setup({ delayed: true });
  const cleanup = registerAndroidBack({ navigate: () => false, beforeExit: () => h.events.push("flush") });
  cleanup(); h.resolve(); await settle();
  assert.equal(h.unregistered, 1);
  h.callback({ canGoBack: false });
  assert.deepEqual(h.events, []);
});
