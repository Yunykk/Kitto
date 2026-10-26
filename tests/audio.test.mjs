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
  pause() {}
  removeAttribute() {}
};
const core = `data:text/javascript;base64,${Buffer.from("export const convertFileSrc = path => path;").toString("base64")}`;
const { outputText } = ts.transpileModule(
  readFileSync(new URL("../src/lib/audio.ts", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } },
);
const code = outputText.replace('"@tauri-apps/api/core"', JSON.stringify(core));
const audio = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);

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
