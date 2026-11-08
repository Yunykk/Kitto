import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import { compileModule } from "svelte/compiler";
import ts from "typescript";

const url = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
function compile(path, imports = {}, runes = false) {
  let code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  }).outputText;
  if (runes) code = compileModule(code, { filename: "tuning.svelte.js", generate: "client" }).js.code;
  for (const [name, value] of Object.entries(imports)) code = code.replaceAll(JSON.stringify(name), JSON.stringify(value)).replaceAll(`'${name}'`, JSON.stringify(value));
  return url(code);
}
const model = compile("../src/lib/tuning.ts");
const { tuningFrequencies, tuningRatio, parseTuningTarget } = await import(model);
const { createTuning } = await import(compile("../src/lib/tuning.svelte.ts", {
  "./tuning": model,
  "svelte/internal/client": import.meta.resolve("svelte/internal/client"),
  svelte: url("export const onMount = fn => { globalThis.__tuningTest.mount = fn; };"),
}, true));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

afterEach(() => {
  globalThis.__tuningTest?.cleanup?.();
  delete globalThis.__tuningTest;
  delete globalThis.localStorage;
});

function setup(saved = null, apply = async () => {}) {
  const entries = new Map(saved === null ? [] : [["kitto.tuning.v1", saved]]);
  const harness = globalThis.__tuningTest = { failSave: false, applied: [] };
  globalThis.localStorage = {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => { if (harness.failSave) throw new Error("Quota"); entries.set(key, value); },
  };
  const state = createTuning(value => { harness.applied.push(value); return apply(value); });
  return { state, harness, entries, mount: async () => { harness.cleanup = harness.mount(); await tick(); } };
}

test("tuning changes the A4 reference through a ratio and validates persisted frequencies", () => {
  assert.equal(tuningRatio(null), 1);
  for (const frequency of tuningFrequencies) assert.equal(tuningRatio(frequency), frequency / 440);
  for (const value of ["432", 440, 0, NaN, Infinity, {}, undefined]) assert.equal(parseTuningTarget(value), null);
  assert.equal(parseTuningTarget(432), 432);
});

test("saved tuning is applied before readiness without replacing stored settings", async () => {
  const saved = JSON.stringify({ version: 1, frequency: 528 });
  const { state, harness, entries, mount } = setup(saved);
  await mount();
  assert.equal(state.isReady, true);
  assert.equal(state.target, 528);
  assert.deepEqual(harness.applied, [528]);
  assert.equal(entries.get("kitto.tuning.v1"), saved);
  await state.setTarget(null);
  assert.equal(JSON.parse(entries.get("kitto.tuning.v1")).frequency, null);
});

test("rapid selections cannot let an older completion overwrite the final preset", async () => {
  const first = deferred();
  const second = deferred();
  const { state, entries, mount } = setup(null, value => value === 396 ? first.promise : value === 852 ? second.promise : Promise.resolve());
  await mount();
  const a = state.setTarget(396);
  const b = state.setTarget(852);
  second.resolve();
  assert.equal(await b, true);
  first.resolve();
  assert.equal(await a, false);
  assert.equal(state.target, 852);
  assert.equal(state.requested, 852);
  assert.equal(state.isApplying, false);
  assert.equal(JSON.parse(entries.get("kitto.tuning.v1")).frequency, 852);
});

test("failed processing restores the previous setting and does not persist the rejected preset", async () => {
  const { state, entries, harness, mount } = setup(null, async value => { if (value === 741) throw new Error("Processor unavailable"); });
  await mount();
  await state.setTarget(432);
  assert.equal(await state.setTarget(741), false);
  assert.equal(state.target, 432);
  assert.equal(state.requested, 432);
  assert.equal(harness.applied.at(-1), 432);
  assert.match(state.error, /Processor unavailable/);
  assert.equal(JSON.parse(entries.get("kitto.tuning.v1")).frequency, 432);
});

test("corrupt storage is left intact until a successful user choice", async () => {
  const { state, entries, mount } = setup("{broken");
  await mount();
  assert.equal(state.target, null);
  assert.match(state.error, /load/);
  assert.equal(entries.get("kitto.tuning.v1"), "{broken");
  await state.setTarget(639);
  assert.equal(state.error, "");
  assert.equal(JSON.parse(entries.get("kitto.tuning.v1")).frequency, 639);
});

test("storage failures keep live tuning and in-flight updates cannot save after disposal", async () => {
  const pending = deferred();
  const { state, harness, entries, mount } = setup(null, value => value === 852 ? pending.promise : Promise.resolve());
  await mount();
  harness.failSave = true;
  assert.equal(await state.setTarget(528), true);
  assert.equal(state.target, 528);
  assert.match(state.error, /save/);
  harness.failSave = false;
  const change = state.setTarget(852);
  harness.cleanup();
  pending.resolve();
  assert.equal(await change, false);
  assert.equal(entries.size, 0);
});
