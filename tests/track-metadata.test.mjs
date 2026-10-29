import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import { compileModule } from "svelte/compiler";
import * as client from "svelte/internal/client";
import ts from "typescript";

const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const transpile = path => ts.transpileModule(
  readFileSync(new URL(path, import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } },
).outputText;
const cacheUrl = moduleUrl(transpile("../src/lib/artwork-cache.ts"));
const fakeCache = moduleUrl(`
  import { createArtworkCache as create } from ${JSON.stringify(cacheUrl)};
  export const createArtworkCache = options => {
    const h = globalThis.__artworkHarness;
    return create({
      ...options,
      createUrl: () => { const url = 'blob:test-' + h.created.length; h.created.push(url); return url; },
      revokeUrl: url => h.revoked.push(url),
      decodeImage: url => {
        const pending = h.deferred();
        h.decodes.push({ url, ...pending });
        return pending.promise;
      },
    });
  };
`);
let code = compileModule(transpile("../src/lib/track-metadata.svelte.ts"), {
  filename: "track-metadata.svelte.js", generate: "client",
}).js.code;
for (const [name, url] of Object.entries({
  "svelte/internal/client": import.meta.resolve("svelte/internal/client"),
  svelte: moduleUrl("export const onDestroy = callback => { globalThis.__artworkHarness.destroy.push(callback); };"),
  "./artwork-cache": fakeCache,
  "./metadata": moduleUrl("export const readTrackMetadata = (path, signal) => globalThis.__artworkHarness.read(path, signal);"),
})) {
  code = code.replaceAll(`"${name}"`, JSON.stringify(url)).replaceAll(`'${name}'`, JSON.stringify(url));
}
const { createTrackMetadata } = await import(moduleUrl(code));

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const metadata = path => ({ title: path, artist: "Artist", album: "Album", cover: new Blob([path]) });
const settle = async () => {
  for (let index = 0; index < 8; index++) await Promise.resolve();
  client.flush();
};
let dispose;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  delete globalThis.__artworkHarness;
});

function setup(initial = "a", upcoming = null) {
  const h = globalThis.__artworkHarness = {
    deferred, reads: [], decodes: [], created: [], revoked: [], destroy: [],
    read(path, signal) {
      const pending = deferred();
      this.reads.push({ path, signal, ...pending });
      return pending.promise;
    },
  };
  const path = client.state(initial), next = client.state(upcoming);
  let state;
  const cleanup = client.effect_root(() => {
    state = createTrackMetadata(() => client.get(path), () => client.get(next));
  });
  client.flush();
  dispose = () => { cleanup(); h.destroy.forEach(callback => callback()); };
  return { h, state, select: value => client.set(path, value), setNext: value => client.set(next, value) };
}

async function complete(h, readIndex, path) {
  h.reads[readIndex].resolve(metadata(path));
  await settle();
  h.decodes.at(-1).resolve({ width: 100, height: 100 });
  await settle();
}

test("metadata exposes loading until cover decode and reuses ready covers on revisit", async () => {
  const { h, state, select } = setup();
  assert.equal(state.coverStatus, "loading");
  assert.equal(state.isLoading, true);
  h.reads[0].resolve(metadata("a"));
  await settle();
  assert.equal(state.coverStatus, "loading");
  assert.equal(state.data, null);
  h.decodes[0].resolve({ width: 100, height: 100 });
  await settle();
  assert.equal(state.coverStatus, "ready");
  assert.equal(state.data.title, "a");
  const firstUrl = state.data.coverUrl;
  select("b");
  assert.equal(state.coverStatus, "loading");
  assert.equal(state.data, null);
  client.flush();
  await complete(h, 1, "b");
  select("a");
  client.flush();
  assert.equal(state.coverStatus, "ready");
  assert.equal(state.data.coverUrl, firstUrl);
  assert.equal(h.reads.length, 2);
});

test("rapid selection rejects stale metadata even after returning to the same path", async () => {
  const { h, state, select } = setup();
  select("b");
  client.flush();
  select("a");
  client.flush();
  assert.equal(h.reads[0].signal.aborted, true);
  assert.equal(h.reads[1].signal.aborted, true);
  h.reads[0].resolve(metadata("stale a"));
  h.reads[1].resolve(metadata("stale b"));
  await settle();
  assert.equal(state.coverStatus, "loading");
  assert.equal(h.created.length, 0);
  await complete(h, 2, "fresh a");
  assert.equal(state.data.title, "fresh a");
});

test("prefetch starts after the current cover and joins selection of the next track", async () => {
  const { h, state, select, setNext } = setup("a", "b");
  assert.equal(h.reads.length, 1);
  await complete(h, 0, "a");
  assert.deepEqual(h.reads.map(read => read.path), ["a", "b"]);
  select("b");
  setNext("c");
  client.flush();
  assert.equal(h.reads.filter(read => read.path === "b").length, 1);
  assert.equal(h.reads[1].signal.aborted, false);
  await complete(h, 1, "b");
  assert.equal(state.data.title, "b");
  assert.equal(h.reads.at(-1).path, "c");
});

test("bad artwork preserves tags and no-track state is missing", async () => {
  const { h, state, select } = setup();
  h.reads[0].resolve(metadata("a"));
  await settle();
  h.decodes[0].reject(new Error("Invalid picture"));
  await settle();
  assert.equal(state.coverStatus, "error");
  assert.equal(state.data.title, "a");
  assert.equal(state.data.artist, "Artist");
  assert.equal(state.data.coverUrl, null);
  assert.equal(state.isLoading, false);
  assert.equal(state.error, "Cover unavailable");
  select(null);
  assert.equal(state.coverStatus, "missing");
  assert.equal(state.data, null);
  client.flush();
  assert.equal(state.isLoading, false);
  dispose();
  dispose = undefined;
  assert.deepEqual(h.revoked, h.created);
});
