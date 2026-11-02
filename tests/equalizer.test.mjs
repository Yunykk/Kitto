import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import { compileModule } from "svelte/compiler";
import ts from "typescript";

const url = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
function compile(path, imports = {}, runes = false) {
  let code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  }).outputText;
  if (runes) code = compileModule(code, { filename: "equalizer.svelte.js", generate: "client" }).js.code;
  for (const [name, value] of Object.entries(imports)) {
    code = code.replaceAll(`"${name}"`, JSON.stringify(value)).replaceAll(`'${name}'`, JSON.stringify(value));
  }
  return url(code);
}
const modelUrl = compile("../src/lib/equalizer.ts");
const { defaultEqualizer, normalizeEqualizer, equalizerPresetId, equalizerPresets } = await import(modelUrl);
const { createEqualizer } = await import(compile("../src/lib/equalizer.svelte.ts", {
  "./equalizer": modelUrl,
  "svelte/internal/client": import.meta.resolve("svelte/internal/client"),
  svelte: url("export const onMount = fn => { globalThis.__eqTest.mount = fn; };"),
}, true));

afterEach(() => {
  globalThis.__eqTest?.cleanup?.();
  delete globalThis.__eqTest;
  delete globalThis.localStorage;
  delete globalThis.window;
  delete globalThis.document;
});

function setup(saved = null) {
  const entries = new Map(saved === null ? [] : [["kitto.equalizer.v1", saved]]);
  const harness = globalThis.__eqTest = { fail: false, applied: [] };
  globalThis.localStorage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => { if (harness.fail) throw new Error("Quota"); entries.set(key, value); },
  };
  globalThis.window = new EventTarget();
  globalThis.document = new EventTarget();
  const state = createEqualizer((settings) => harness.applied.push(settings));
  harness.cleanup = () => {};
  return { state, entries, harness, mount: () => { harness.cleanup = harness.mount(); } };
}

test("equalizer normalizes corrupt bands, booleans and preamp without sharing defaults", () => {
  const data = normalizeEqualizer({ enabled: true, gains: [Infinity, 100, -99, 1.26, "4"], preamp: -99, autoPreamp: false });
  assert.deepEqual(data.gains, [0, 12, -12, 1.5, 0, 0, 0, 0, 0, 0]);
  assert.equal(data.preamp, -24);
  assert.equal(data.enabled, true);
  assert.equal(data.autoPreamp, false);
  const initial = defaultEqualizer();
  initial.gains[0] = 10;
  assert.equal(defaultEqualizer().gains[0], 0);
});

test("presets are detected from the full curve and manual edits become Custom", () => {
  for (const preset of equalizerPresets) assert.equal(equalizerPresetId(preset.gains), preset.id);
  assert.equal(equalizerPresetId([1, ...Array(9).fill(0)]), "custom");
  assert.equal(equalizerPresetId([]), "custom");
});

test("equalizer restores settings before edits and persists presets, bypass and preamp", () => {
  const { state, harness, entries, mount } = setup(JSON.stringify({ version: 1, ...defaultEqualizer(), preamp: -3 }));
  state.setEnabled(true);
  assert.equal(state.settings.enabled, false);
  mount();
  assert.equal(state.isReady, true);
  assert.equal(state.settings.preamp, -3);
  state.usePreset("bass-boost");
  state.setEnabled(true);
  state.setAutoPreamp(false);
  state.setPreamp(-6);
  state.flush();
  const stored = JSON.parse(entries.get("kitto.equalizer.v1"));
  assert.equal(stored.enabled, true);
  assert.equal(stored.preamp, -6);
  assert.equal(stored.autoPreamp, false);
  assert.equal(equalizerPresetId(stored.gains), "bass-boost");
  state.setEnabled(false);
  assert.equal(state.preset, "bass-boost");
  assert.equal(harness.applied.at(-1).enabled, false);
});

test("reset flattens the curve while preserving Enabled; invalid edits are ignored", () => {
  const { state, mount } = setup(); mount();
  state.setEnabled(true);
  state.setBand(3, 6.3);
  state.setBand(10, 4);
  state.setBand(1.5, 4);
  state.setBand(3, NaN);
  assert.equal(state.settings.gains[3], 6.5);
  assert.equal(state.settings.gains.length, 10);
  assert.equal(state.preset, "custom");
  state.reset();
  assert.equal(state.settings.enabled, true);
  assert.equal(state.preset, "flat");
  assert.equal(state.settings.autoPreamp, true);
});

test("failed writes report an error and can be retried without losing live settings", () => {
  const { state, harness, entries, mount } = setup(); mount();
  state.setBand(0, 4);
  harness.fail = true;
  state.flush();
  assert.match(state.error, /save/);
  assert.equal(state.settings.gains[0], 4);
  harness.fail = false;
  window.dispatchEvent(new Event("pagehide"));
  assert.equal(state.error, "");
  assert.equal(JSON.parse(entries.get("kitto.equalizer.v1")).gains[0], 4);
});

test("invalid storage recovers to a usable flat equalizer", () => {
  const { state, mount } = setup("{broken"); mount();
  assert.equal(state.isReady, true);
  assert.equal(state.preset, "flat");
  assert.match(state.error, /load/);
  state.usePreset("vocals");
  assert.equal(state.preset, "vocals");
});
