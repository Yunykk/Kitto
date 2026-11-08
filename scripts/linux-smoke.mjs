import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";

if (process.platform !== "linux") throw new Error("Run the native smoke test on Linux.");
const fixtureDirectory = "/tmp/kitto-linux-smoke";
await mkdir(fixtureDirectory, { recursive: true });
const file = `${fixtureDirectory}/Linux #100% — track.wav`;
const sampleRate = 44100;
const samples = sampleRate * 15;
const wav = Buffer.alloc(44 + samples * 2);
wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36);
wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i * 440 * Math.PI * 2 / sampleRate) * 2000), 44 + i * 2);
await writeFile(file, wav);
const tracks = [{ id: "linux-smoke", title: "Linux WAV", path: file }];
if (process.env.KITTO_TEST_CODECS === "1") {
  for (const [extension, pipeline] of [
    ["mp3", ["lamemp3enc"]],
    ["flac", ["flacenc"]],
    ["ogg", ["vorbisenc", "!", "oggmux"]],
    ["opus", ["opusenc", "!", "oggmux"]],
    ["m4a", ["avenc_aac", "!", "aacparse", "!", "mp4mux"]],
  ]) {
    const path = `${fixtureDirectory}/Linux ${extension}.${extension}`;
    const encoded = spawnSync("gst-launch-1.0", ["-q", "filesrc", `location=${file}`, "!", "wavparse", "!", "audioconvert", "!", "audioresample", "!", ...pipeline, "!", "filesink", `location=${path}`], { stdio: "inherit", timeout: 15000 });
    assert.equal(encoded.status, 0, `Could not generate ${extension} fixture`);
    tracks.push({ id: `linux-${extension}`, title: `Linux ${extension}`, path });
  }
}

const profile = await mkdtemp(join(tmpdir(), "kitto-smoke-profile-"));
const driver = spawn("tauri-driver", [], { stdio: "inherit", env: {
  ...process.env,
  XDG_DATA_HOME: join(profile, "data"), XDG_CONFIG_HOME: join(profile, "config"),
  XDG_CACHE_HOME: join(profile, "cache"), XDG_STATE_HOME: join(profile, "state"),
} });
driver.on("error", error => { console.error(error.message); process.exitCode = 1; });
let session;
let meter;
let peak = 0;
let meterError;
if (process.env.KITTO_AUDIO_MONITOR) {
  meter = spawn("parec", ["--device", process.env.KITTO_AUDIO_MONITOR, "--format=s16le", "--rate=44100", "--channels=2"], { stdio: ["ignore", "pipe", "inherit"] });
  meter.on("error", error => { meterError = error; });
  meter.stdout.on("data", chunk => {
    for (let offset = 0; offset + 1 < chunk.length; offset += 2) peak = Math.max(peak, Math.abs(chunk.readInt16LE(offset)));
  });
}
async function request(method, path, body) {
  const response = await fetch(`http://127.0.0.1:4444${path}`, {
    method, headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok || result.value?.error) throw new Error(JSON.stringify(result));
  return result.value;
}
const execute = (script, args = []) => request("POST", `/session/${session}/execute/sync`, { script, args });
const capabilities = { capabilities: { alwaysMatch: {
  browserName: "wry", "tauri:options": { application: resolve(process.argv[2] ?? "src-tauri/target/debug/kitto") },
} } };
async function waitFor(script) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (await execute(script)) return;
    await delay(250);
  }
  throw new Error(`Timed out: ${script}`);
}
async function click(selector) {
  const element = await request("POST", `/session/${session}/element`, { using: "css selector", value: selector });
  const id = element["element-6066-11e4-a52e-4f735466cecf"];
  await request("POST", `/session/${session}/element/${id}/click`, {});
}
async function pickFile(path) {
  await click(".library-panel .choose-files");
  let dialog;
  for (let attempt = 0; attempt < 60; attempt++) {
    const found = spawnSync("xdotool", ["search", "--onlyvisible", "--name", "Add music"], { encoding: "utf8" });
    if (found.status === 0) { dialog = found.stdout.trim().split("\n").at(-1); break; }
    await delay(100);
  }
  if (!dialog) console.error(spawnSync("xdotool", ["search", "--onlyvisible", "--name", ".", "getwindowname", "%@"], { encoding: "utf8" }));
  assert.ok(dialog, "Native file picker did not open");
  const key = (...args) => {
    const result = spawnSync("xdotool", args, { stdio: "inherit" });
    assert.equal(result.status, 0, "Could not operate the native picker");
  };
  key("windowfocus", "--sync", dialog);
  key("key", "--clearmodifiers", "ctrl+l");
  const clipboard = spawn("xclip", ["-selection", "clipboard", "-loops", "1"], { stdio: ["pipe", "ignore", "inherit"] });
  clipboard.stdin.end(path);
  await delay(150);
  key("key", "--clearmodifiers", "ctrl+v");
  await delay(150);
  key("key", "Return");
  await delay(400);
  const stillOpen = spawnSync("xdotool", ["search", "--onlyvisible", "--name", "Add music"], { stdio: "ignore" });
  if (stillOpen.status === 0) key("key", "Return");
  clipboard.kill();
  await waitFor("return !document.querySelector('.library-panel .choose-files').disabled");
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { await request("GET", "/status"); ready = true; break; } catch { await delay(250); }
  }
  assert.ok(ready, "tauri-driver did not start");
  const created = await request("POST", "/session", capabilities);
  session = created.sessionId;
  await request("POST", `/session/${session}/window/rect`, { width: 1100, height: 820 });
  await waitFor("return !!document.querySelector('[aria-label=\"Open settings\"]')");
  assert.equal(await execute("return !!window.__TAURI_INTERNALS__"), true);
  if (process.env.KITTO_TEST_NATIVE_PICKER === "1") {
    for (const track of tracks) await pickFile(track.path);
  } else {
    await execute(`window.addEventListener('pagehide', event => event.stopImmediatePropagation(), {capture:true,once:true}); localStorage.setItem('kitto.library.v1', JSON.stringify({tracks:arguments[0],currentTrackId:'linux-smoke',position:0})); location.reload();`, [tracks]);
  }
  await waitFor("return document.querySelector('#track-heading')?.textContent.includes('Linux') && !document.querySelector('[aria-label=\"Play\"]').disabled");
  assert.equal(await execute("return window.__TAURI_INTERNALS__.invoke('open_audio_stream', {path:'/etc/passwd'}).then(()=>false,()=>true)"), true, "Unselected files must be denied");
  await execute(`const original = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function(...args) { window.__smokeAudio = this; return original.apply(this, args); };`);
  await execute(`const OriginalContext = window.AudioContext; window.AudioContext = class extends OriginalContext { constructor(...args) { super(...args); window.__smokeContext = this; } };`);
  await click('[aria-label="Play"]');
  await waitFor("return !!document.querySelector('[aria-label=\"Pause\"]') && document.querySelector('input[type=range]') !== null");
  await waitFor("return Number(document.querySelector('[aria-label=\"Playback position\"]').value) > 0.5");
  if (meter) {
    for (let attempt = 0; peak <= 100 && attempt < 30; attempt++) await delay(100);
    assert.ifError(meterError);
    assert.ok(peak > 100, `Audio output must contain the fixture tone (peak ${peak})`);
  }
  const streamUrl = await execute("return window.__smokeAudio.currentSrc");
  const rangeResponse = await fetch(streamUrl, { headers: { Range: "bytes=0-15" } });
  assert.equal(rangeResponse.status, 206);
  const prefix = Buffer.from(await rangeResponse.arrayBuffer());
  assert.equal(prefix.length, 16);
  assert.equal(prefix.toString("ascii", 0, 4), "RIFF");
  await execute("const r=document.querySelector('[aria-label=\"Playback position\"]'); r.value='8'; r.dispatchEvent(new Event('input',{bubbles:true})); r.dispatchEvent(new Event('change',{bubbles:true}));");
  await waitFor("return window.__smokeAudio.currentTime > 8.2");
  assert.equal(await execute("return !!document.querySelector('[role=alert].playback-error')"), false);
  await click('[aria-label="Pause"]');
  for (const track of tracks.slice(1)) {
    await click('[aria-label="Next track"]');
    await waitFor(`return document.querySelector('#track-heading')?.textContent.includes(${JSON.stringify(track.title)})`);
    await waitFor("return Number(document.querySelector('[aria-label=\"Playback position\"]').value) > 0.3 && !!document.querySelector('[aria-label=\"Pause\"]')");
    await click('[aria-label="Pause"]');
  }
  await click('[aria-label="Open equalizer"]');
  await waitFor("return !!document.querySelector('.equalizer-dialog[open]')");
  assert.equal(await execute("return document.querySelectorAll('.band-slider').length"), 10);
  await click('[aria-label="Close equalizer"]');
  await click('[aria-label="Open settings"]');
  await waitFor("return !!document.querySelector('dialog[open]')");
  await execute("document.querySelector('dialog[open]').close()");
  const popover = await execute("return !!document.querySelector('.popover-trigger')");
  if (popover) {
    await click(".popover-trigger");
    await waitFor("return !!document.querySelector('.popover-panel:popover-open')");
  }
  assert.equal(await execute("return document.documentElement.scrollWidth <= innerWidth"), true);
  for (const theme of ["orbit", "soft-ceramic", "editorial", "tape-deck", "floating-bento", "paper-club"]) {
    for (const mode of ["light", "dark"]) {
      await execute("localStorage.setItem('kitto.appearance.v1', JSON.stringify({version:1,theme:arguments[0],mode:arguments[1],accent:'#ff6a1a'})); location.reload();", [theme, mode]);
      await waitFor(`return document.documentElement.dataset.theme === ${JSON.stringify(theme)} && !!document.querySelector('#track-heading')`);
      for (const [width, height] of [[1100, 820], [1100, 560], [360, 560]]) {
        await request("POST", `/session/${session}/window/rect`, { width, height });
        await delay(150);
        assert.equal(await execute("return document.documentElement.scrollWidth <= innerWidth"), true, `${theme}/${mode}/${width}: horizontal overflow`);
      }
    }
  }
  if (process.env.KITTO_TEST_NATIVE_PICKER === "1") {
    await request("DELETE", `/session/${session}`);
    session = undefined;
    const restarted = await request("POST", "/session", capabilities);
    session = restarted.sessionId;
    await waitFor("return document.querySelector('#track-heading')?.textContent.includes('Linux') && !!document.querySelector('[aria-label=\"Play\"]')");
    await click('[aria-label="Play"]');
    await waitFor("return Number(document.querySelector('[aria-label=\"Playback position\"]').value) > 1.5 && !!document.querySelector('[aria-label=\"Pause\"]')");
    await click('[aria-label="Pause"]');
  }
  console.log(`Linux native smoke passed: ${tracks.length} audio formats, streaming ranges, file scope, Web Audio${meter ? ` (output peak ${peak})` : ""}, equalizer, menus and 36 theme layouts.`);
} catch (error) {
  console.error(error);
  if (session) {
    await mkdir(".verification", { recursive: true });
    const screenshot = await request("GET", `/session/${session}/screenshot`).catch(() => null);
    if (screenshot) await writeFile(".verification/linux-smoke-failure.png", Buffer.from(screenshot, "base64"));
    const body = await execute("return document.body.innerText").catch(() => "Page unavailable");
    console.error(body);
    console.error(await execute("const a=window.__smokeAudio; return a ? {src:a.currentSrc,time:a.currentTime,paused:a.paused,error:a.error && {code:a.error.code,message:a.error.message},networkState:a.networkState,readyState:a.readyState} : null").catch(() => null));
    console.error(await execute("const c=window.__smokeContext; return c ? {state:c.state,time:c.currentTime,sampleRate:c.sampleRate} : null").catch(() => null));
  }
  throw error;
} finally {
  if (session) await request("DELETE", `/session/${session}`).catch(() => {});
  driver.kill();
  meter?.kill();
  await delay(300);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(error => console.warn(`Could not remove temporary profile: ${error.message}`));
}
