import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test } from "node:test";
import ts from "typescript";

const { outputText } = ts.transpileModule(
  readFileSync(new URL("../src/lib/artwork-cache.ts", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } },
);
const { createArtworkCache, decodeArtwork } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`,
);

const blob = () => new Blob(["cover"]);
const tags = (path, cover = blob()) => ({ title: path, artist: "Artist", album: "Album", cover });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
const caches = [];

function setup(overrides = {}) {
  const reads = [], created = [], revoked = [], released = [];
  const cache = createArtworkCache({
    readMetadata: async (path, signal) => { reads.push({ path, signal }); return tags(path); },
    decodeImage: async url => ({ width: 100, height: 100, release: () => released.push(url) }),
    createUrl: () => { const url = `blob:cover-${created.length}`; created.push(url); return url; },
    revokeUrl: url => revoked.push(url),
    ...overrides,
  });
  caches.push(cache);
  return { cache, reads, created, revoked, released };
}

afterEach(() => {
  caches.splice(0).forEach(cache => cache.dispose());
  delete globalThis.Image;
});

test("current and prefetch share parsing and publish artwork only after decoding", async () => {
  const decode = deferred();
  const { cache, reads, created, revoked } = setup({ decodeImage: () => decode.promise });
  const prefetch = cache.acquire("a");
  const current = cache.acquire("a");
  await settle();
  assert.equal(reads.length, 1);
  assert.equal(created.length, 1);
  assert.equal(current.result, null);
  prefetch.release();
  assert.equal(reads[0].signal.aborted, false);
  decode.resolve({ width: 100, height: 100 });
  const ready = await current.promise;
  assert.equal(ready.coverStatus, "ready");
  assert.equal(ready.coverUrl, created[0]);
  assert.deepEqual(revoked, []);
  current.release();
  const revisit = cache.acquire("a");
  assert.equal(revisit.result.coverUrl, ready.coverUrl);
  assert.equal(reads.length, 1);
  revisit.release();
});

test("releasing the last subscriber cancels parsing and rapid reacquisition starts fresh", async () => {
  const first = deferred(), second = deferred();
  const signals = [];
  const { cache } = setup({ readMetadata: (path, signal) => {
    signals.push(signal);
    return signals.length === 1 ? first.promise : second.promise;
  } });
  const abandoned = cache.acquire("a");
  abandoned.release();
  assert.equal(signals[0].aborted, true);
  const current = cache.acquire("a");
  assert.equal(signals[1].aborted, false);
  first.resolve(tags("old"));
  await assert.rejects(abandoned.promise, { name: "AbortError" });
  second.resolve(tags("new"));
  assert.equal((await current.promise).title, "new");
  current.release();
});

test("late decodes from cancelled loads release their resources exactly once", async () => {
  const decode = deferred();
  const { cache, created, revoked } = setup({ decodeImage: () => decode.promise });
  const lease = cache.acquire("a");
  await settle();
  lease.release();
  lease.release();
  assert.deepEqual(revoked, created);
  let releases = 0;
  decode.resolve({ width: 10, height: 10, release: () => { releases += 1; } });
  await assert.rejects(lease.promise, { name: "AbortError" });
  cache.dispose();
  assert.equal(releases, 1);
  assert.equal(revoked.length, 1);
});

test("missing covers are cached while decode errors retain tags and can retry", async () => {
  let failures = 0;
  const { cache, created, revoked } = setup({
    readMetadata: async path => tags(path, path === "missing" ? null : blob()),
    decodeImage: async () => {
      if (failures++ === 0) throw new Error("Corrupt cover");
      return { width: 10, height: 10 };
    },
  });
  const missing = cache.acquire("missing");
  assert.equal((await missing.promise).coverStatus, "missing");
  missing.release();
  const missingAgain = cache.acquire("missing");
  assert.equal(missingAgain.result.coverStatus, "missing");
  assert.equal(created.length, 0);
  missingAgain.release();
  const broken = cache.acquire("broken");
  const failure = await broken.promise;
  assert.equal(failure.coverStatus, "error");
  assert.equal(failure.title, "broken");
  assert.equal(failure.artist, "Artist");
  assert.equal(failure.coverUrl, null);
  assert.deepEqual(revoked, [created[0]]);
  const retry = cache.acquire("broken");
  broken.release();
  assert.equal((await retry.promise).coverStatus, "ready");
  retry.release();
});

test("file read failures are retried instead of cached as missing artwork", async () => {
  let reads = 0;
  const { cache } = setup({ readMetadata: async path => {
    if (reads++ === 0) throw new Error("File unavailable");
    return tags(path);
  } });
  const failure = cache.acquire("a");
  assert.equal((await failure.promise).error, "Metadata unavailable");
  failure.release();
  const retry = cache.acquire("a");
  assert.equal((await retry.promise).coverStatus, "ready");
  assert.equal(reads, 2);
  retry.release();
});

test("LRU eviction keeps active artwork alive and evicts inactive artwork", async () => {
  const { cache, reads, revoked } = setup({ maxEntries: 2 });
  const current = cache.acquire("a");
  const a = await current.promise;
  const second = cache.acquire("b");
  const b = await second.promise;
  second.release();
  const third = cache.acquire("c");
  await third.promise;
  third.release();
  assert.equal(revoked.includes(a.coverUrl), false);
  assert.equal(revoked.includes(b.coverUrl), true);
  const revisit = cache.acquire("a");
  assert.equal(revisit.result.coverUrl, a.coverUrl);
  assert.equal(reads.filter(read => read.path === "a").length, 1);
  revisit.release();
  current.release();
});

test("decoded pixels count toward memory budget and oversized images survive only while leased", async () => {
  const { cache, reads, revoked } = setup({ maxBytes: 1000 });
  const lease = cache.acquire("large");
  const ready = await lease.promise;
  assert.equal(revoked.includes(ready.coverUrl), false);
  lease.release();
  assert.equal(revoked.includes(ready.coverUrl), true);
  const reload = cache.acquire("large");
  await reload.promise;
  assert.equal(reads.length, 2);
  reload.release();
});

test("disposal releases decoded images and URLs once even when leases are later released", async () => {
  const { cache, created, revoked, released } = setup();
  const a = cache.acquire("a"), b = cache.acquire("b");
  await Promise.all([a.promise, b.promise]);
  cache.dispose();
  a.release();
  b.release();
  cache.dispose();
  assert.deepEqual([...revoked].sort(), [...created].sort());
  assert.deepEqual([...released].sort(), [...created].sort());
  assert.throws(() => cache.acquire("c"), /closed/);
});

test("browser image preload waits for decode and responds to cancellation", async () => {
  const images = [];
  globalThis.Image = class {
    constructor() { this.pending = deferred(); images.push(this); }
    naturalWidth = 20;
    naturalHeight = 30;
    src = "";
    decode() { return this.pending.promise; }
  };
  const active = new AbortController();
  const promise = decodeArtwork("blob:valid", active.signal);
  images[0].pending.resolve();
  const decoded = await promise;
  assert.equal(decoded.width, 20);
  assert.equal(images[0].src, "blob:valid");
  decoded.release();
  assert.equal(images[0].src, "");
  const cancelled = new AbortController();
  const interrupted = decodeArtwork("blob:cancelled", cancelled.signal);
  cancelled.abort();
  await assert.rejects(interrupted, { name: "AbortError" });
  assert.equal(images[1].src, "");
  images[1].pending.resolve();
  await settle();
});
