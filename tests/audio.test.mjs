import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

let element;
globalThis.Audio = class extends EventTarget {
  constructor() { super(); element = this; }
  currentTime = 0;
  duration = NaN;
  volume = 1;
  load() {}
  pauses = 0;
  pause() { this.pauses++; }
  play() { return Promise.resolve(); }
  removeAttribute() {}
};
const core = `data:text/javascript;base64,${Buffer.from("export const convertFileSrc = path => path;").toString("base64")}`;
function compileSource(path, imports = {}) {
  const { outputText } = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } },
  );
  let code = outputText;
  for (const [name, replacement] of Object.entries(imports)) {
    code = code.replaceAll(`"${name}"`, JSON.stringify(replacement))
      .replaceAll(`'${name}'`, JSON.stringify(replacement));
  }
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
}
const equalizerModel = compileSource("../src/lib/equalizer.ts");
const equalizerEngine = compileSource("../src/lib/equalizer-engine.ts", { "./equalizer": equalizerModel });
const audio = await import(compileSource("../src/lib/audio.ts", {
  "@tauri-apps/api/core": core,
  "./equalizer-engine": equalizerEngine,
}));

test("seeking before loadedmetadata updates the pending restore position", () => {
  audio.loadAudio("a.wav", 12);
  element.duration = 60;
  audio.seekTo(20);
  assert.equal(audio.getAudioProgress().currentTime, 20);
  element.dispatchEvent(new Event("loadedmetadata"));
  assert.equal(element.currentTime, 20);
});

test("seeking clamps to the duration and ignores non-finite values", () => {
  audio.loadAudio("b.wav");
  element.duration = 60;
  element.dispatchEvent(new Event("loadedmetadata"));
  audio.seekTo(-10);
  assert.equal(element.currentTime, 0);
  audio.seekTo(100);
  assert.equal(element.currentTime, 60);
  audio.seekTo(NaN);
  assert.equal(element.currentTime, 60);
});

test("unloading discards the pending position", () => {
  audio.loadAudio("c.wav", 15);
  audio.unloadAudio();
  element.currentTime = 0;
  assert.equal(audio.getAudioProgress().currentTime, 0);
});

test("an older failed play request cannot pause a newer track", async () => {
  globalThis.AudioContext = class {
    sampleRate = 48000;
    currentTime = 0;
    state = "running";
    destination = {};
    node() { return { connect() {}, gain: { value: 0 }, frequency: { value: 0 }, Q: { value: 0 }, getFrequencyResponse(_frequencies, magnitudes) { magnitudes.fill(1); } }; }
    createGain() { return this.node(); }
    createBiquadFilter() { return this.node(); }
    createMediaElementSource() { return this.node(); }
  };
  let rejectFirst;
  element.play = () => new Promise((_, reject) => { rejectFirst = reject; });
  const first = audio.playAudio();
  audio.loadAudio("new.wav");
  element.play = () => Promise.resolve();
  await audio.playAudio();
  const pauses = element.pauses;
  rejectFirst(new Error("Old request"));
  await assert.rejects(first, /Old request/);
  assert.equal(element.pauses, pauses);
  delete globalThis.AudioContext;
});
