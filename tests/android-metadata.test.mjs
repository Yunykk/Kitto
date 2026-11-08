import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import ts from "typescript";

const url = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
let code = ts.transpileModule(readFileSync(new URL("../src/lib/metadata.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
}).outputText;
code = code.replace('"@tauri-apps/api/core"', JSON.stringify(url("export const convertFileSrc = path => path;")))
  .replace('"./android-bridge"', JSON.stringify(url(`
    export const isAndroidAudio = () => true;
    export const androidRequest = async (command, payload) => {
      globalThis.__androidMetadataCalls.push({command, payload});
      if (globalThis.__androidMetadataError) throw globalThis.__androidMetadataError;
      if (globalThis.__androidMetadataPending) return await globalThis.__androidMetadataPending;
      return globalThis.__androidMetadataResult;
    };
  `)));
const { readTrackMetadata } = await import(url(code));

function setup(result = {}) {
  globalThis.__androidMetadataCalls = [];
  globalThis.__androidMetadataResult = { title: null, artist: null, album: null, coverBase64: null, coverMime: null, ...result };
  return new AbortController();
}
afterEach(() => {
  for (const key of ["__androidMetadataCalls", "__androidMetadataResult", "__androidMetadataPending", "__androidMetadataError"]) delete globalThis[key];
});

test("Android metadata reads the granted URI natively and decodes its bounded thumbnail", async () => {
  const controller = setup({ title: " Song ", artist: " Artist ", album: " Album ", coverBase64: "AQIDBA==", coverMime: "image/png" });
  const uri = "content://provider/document/audio%3A21";
  const tags = await readTrackMetadata(uri, controller.signal);
  assert.deepEqual(globalThis.__androidMetadataCalls, [{ command: "metadata", payload: { uri, includeCover: true } }]);
  assert.deepEqual([tags.title, tags.artist, tags.album], ["Song", "Artist", "Album"]);
  assert.equal(tags.cover.type, "image/png");
  assert.deepEqual([...new Uint8Array(await tags.cover.arrayBuffer())], [1, 2, 3, 4]);
});

test("Android queue indexing skips cover decoding when artwork was not requested", async () => {
  const controller = setup({ title: "Song", coverBase64: "AQIDBA==", coverMime: "image/png" });
  const tags = await readTrackMetadata("content://provider/track", controller.signal, false);
  assert.equal(globalThis.__androidMetadataCalls[0].payload.includeCover, false);
  assert.equal(tags.cover, null);
});

test("Android preserves album artist and disc order while rejecting invalid ordinals", async () => {
  const controller = setup({ albumArtist: " Compilation artist ", trackNumber: 12, discNumber: 2 });
  const tags = await readTrackMetadata("content://provider/track", controller.signal, false);
  assert.equal(tags.albumArtist, "Compilation artist");
  assert.equal(tags.trackNumber, 12);
  assert.equal(tags.discNumber, 2);
  globalThis.__androidMetadataResult.trackNumber = -1;
  globalThis.__androidMetadataResult.discNumber = 1.5;
  const invalid = await readTrackMetadata("content://provider/track", controller.signal, false);
  assert.equal(invalid.trackNumber, null);
  assert.equal(invalid.discNumber, null);
});

test("Android metadata keeps valid tags when the thumbnail is invalid or not an image", async () => {
  const controller = setup({ title: "Song", coverBase64: "%%%", coverMime: "image/jpeg" });
  assert.equal((await readTrackMetadata("content://provider/track", controller.signal)).title, "Song");
  assert.equal((await readTrackMetadata("content://provider/track", controller.signal)).cover, null);
  globalThis.__androidMetadataResult.coverBase64 = "AQIDBA==";
  globalThis.__androidMetadataResult.coverMime = "text/html";
  assert.equal((await readTrackMetadata("content://provider/track", controller.signal)).cover, null);
});

test("Android metadata does not return a result after cancellation", async () => {
  const controller = setup();
  controller.abort();
  await assert.rejects(readTrackMetadata("content://provider/track", controller.signal), { name: "AbortError" });
  assert.equal(globalThis.__androidMetadataCalls.length, 0);
  const active = new AbortController();
  let finish;
  globalThis.__androidMetadataPending = new Promise(resolve => { finish = resolve; });
  const reading = readTrackMetadata("content://provider/track", active.signal);
  active.abort();
  finish(globalThis.__androidMetadataResult);
  await assert.rejects(reading, { name: "AbortError" });
});

test("revoked Android document access propagates a readable metadata failure", async () => {
  const controller = setup();
  globalThis.__androidMetadataError = new Error("Document permission was revoked.");
  await assert.rejects(readTrackMetadata("content://provider/track", controller.signal), /permission was revoked/);
});
