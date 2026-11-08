import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const url = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
let code = ts.transpileModule(readFileSync(new URL("../src/lib/audio-source.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
}).outputText.replaceAll('"@tauri-apps/api/core"', JSON.stringify(url("export const convertFileSrc=x=>x; export const invoke=()=>{}; export const isTauri=()=>true;")));
const { createAudioSource } = await import(url(code));

test("Linux sources reject stale replies and release replaced and closed streams", async () => {
  const pending = new Map();
  const closed = [];
  const ready = [];
  const source = createAudioSource(path => new Promise(resolve => pending.set(path, resolve)), async url => { closed.push(url); });
  const a = source.load("A", url => ready.push(url));
  const b = source.load("B", url => ready.push(url));
  pending.get("B")("stream-B"); await b;
  pending.get("A")("stream-A"); await a;
  assert.deepEqual(ready, ["stream-B"]);
  assert.deepEqual(closed, ["stream-A"]);
  source.release();
  assert.deepEqual(closed, ["stream-A", "stream-B"]);
  const c = source.load("C", url => ready.push(url));
  source.release(); pending.get("C")("stream-C"); await c;
  assert.deepEqual(closed, ["stream-A", "stream-B", "stream-C"]);
  assert.deepEqual(ready, ["stream-B"]);
});

test("Linux source failures are returned and permit a later retry", async () => {
  let calls = 0;
  const source = createAudioSource(async () => { if (++calls === 1) throw new Error("Denied"); return "retry"; }, async () => {});
  await assert.rejects(source.load("A", () => {}), /Denied/);
  let ready;
  await source.load("A", url => ready = url);
  assert.equal(ready, "retry");
  source.release();
});

test("pausing while a Linux stream opens prevents delayed autoplay", async () => {
  const originalAudio = globalThis.Audio;
  let element;
  let resolveSource;
  globalThis.__openLinuxAudio = () => new Promise(resolve => { resolveSource = resolve; });
  globalThis.Audio = class extends EventTarget {
    constructor() { super(); element = this; }
    currentTime = 0; duration = NaN; paused = true; readyState = 0; playbackRate = 1; plays = 0;
    load() {}
    removeAttribute() { this.src = ""; }
    pause() { this.paused = true; }
    play() { this.plays++; this.paused = false; return Promise.resolve(); }
  };
  const sourceModule = url(`import {createAudioSource as create} from ${JSON.stringify(url(code))}; export const needsLinuxAudioStream=()=>true; export const convertFileSrc=x=>x; export const createAudioSource=()=>create(path=>globalThis.__openLinuxAudio(path),async()=>{});`);
  const engine = url("export const createEqualizerEngine=()=>({prepare(){},resume:async()=>{},configure(){},resetTuning(){},dispose(){}});");
  let audioCode = ts.transpileModule(readFileSync(new URL("../src/lib/audio-desktop.ts", import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  }).outputText.replaceAll('"./audio-source"', JSON.stringify(sourceModule)).replaceAll('"./equalizer-engine"', JSON.stringify(engine));
  try {
    const audio = await import(url(audioCode));
    audio.loadAudio("/Music/a.wav");
    const playing = audio.playAudio();
    audio.pauseAudio();
    resolveSource("http://127.0.0.1:1234/token");
    await playing;
    assert.equal(element.plays, 0);
    assert.equal(element.paused, true);
    await audio.playAudio();
    assert.equal(element.plays, 1);
    audio.unloadAudio();
  } finally {
    globalThis.Audio = originalAudio;
    delete globalThis.__openLinuxAudio;
  }
});
