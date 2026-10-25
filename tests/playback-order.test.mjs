import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { compileModule } from "svelte/compiler";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/lib/playback-order.svelte.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
});
const { js } = compileModule(outputText, {
  filename: "playback-order.svelte.js",
  generate: "client",
});
const client = JSON.stringify(import.meta.resolve("svelte/internal/client"));
const code = js.code.replace(/(["'])svelte\/internal\/client\1/g, client);
const { createPlaybackOrder } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);

function setup(initialIds = ["a", "b", "c", "d"]) {
  let ids = initialIds;
  return {
    order: createPlaybackOrder(() => ids),
    setIds(nextIds) { ids = nextIds; },
  };
}

test("finishing a shuffle cycle turns shuffle off without repeating tracks", () => {
  const { order } = setup();
  order.select("a");
  order.setShuffle(true);
  const visited = new Set(["a"]);

  for (let step = 0; step < 3; step += 1) {
    assert.equal(order.canNext(false), true);
    const id = order.next(false);
    assert.ok(id);
    assert.equal(visited.has(id), false);
    visited.add(id);
  }

  assert.equal(visited.size, 4);
  assert.equal(order.shuffle, false);
  order.select("b", true);
  assert.equal(order.canNext(false), true);
  assert.equal(order.next(false), "c");
});

test("manual selection starts a fresh shuffle cycle after exhaustion", () => {
  const { order } = setup(["a", "b", "c"]);
  order.select("a");
  order.setShuffle(true);
  order.next(true);
  order.next(true);
  order.select("b", true);

  assert.equal(order.shuffle, true);
  assert.equal(order.canNext(false), true);
  assert.notEqual(order.next(false), "b");
});

test("selecting the current track manually also restarts the cycle", () => {
  const { order } = setup(["a", "b", "c"]);
  order.select("a");
  order.setShuffle(true);
  order.next(true);
  order.next(true);
  const current = order.currentId;
  order.select(current, true);

  assert.equal(order.canNext(false), true);
  assert.notEqual(order.next(false), current);
});

test("Previous and Next follow the same shuffle history", () => {
  const { order } = setup();
  order.select("a");
  order.setShuffle(true);
  const first = order.next(false);
  const second = order.next(false);

  assert.equal(order.previous(false), first);
  assert.equal(order.next(false), second);
  assert.equal(order.shuffle, true);
});

test("Repeat all continues shuffle without immediately repeating a track", () => {
  const { order } = setup();
  order.select("a");
  order.setShuffle(true);

  for (let step = 0; step < 24; step += 1) {
    const previous = order.currentId;
    assert.notEqual(order.next(true), previous);
    assert.equal(order.shuffle, true);
    assert.equal(order.canNext(true), true);
  }
});

test("turning Repeat all off completes an exhausted cycle", () => {
  const { order } = setup(["a", "b", "c"]);
  order.select("a");
  order.setShuffle(true);
  order.next(true);
  order.next(true);
  order.finishCycle(false);

  assert.equal(order.shuffle, false);
});

test("deleted tracks are skipped in shuffle history", () => {
  const { order, setIds } = setup();
  order.select("a");
  order.setShuffle(true);
  const removed = order.next(false);
  const current = order.next(false);
  setIds(["a", "b", "c", "d"].filter((id) => id !== removed));

  assert.equal(order.previous(false), "a");
  assert.equal(order.next(false), current);
});

test("removing the last unplayed track finishes the cycle", () => {
  const { order, setIds } = setup(["a", "b", "c"]);
  order.select("a");
  order.setShuffle(true);
  const current = order.next(false);
  setIds(["a", current]);
  order.finishCycle(false);

  assert.equal(order.shuffle, false);
});

test("ordered playback respects queue boundaries and Repeat all", () => {
  const { order } = setup(["a", "b", "c"]);
  order.select("c");
  assert.equal(order.canNext(false), false);
  assert.equal(order.next(false), null);
  assert.equal(order.next(true), "a");
  assert.equal(order.canPrevious(false), false);
  assert.equal(order.previous(true), "c");
});

test("clearing the queue preserves shuffle preference and permits new tracks", () => {
  const { order, setIds } = setup();
  order.select("a");
  order.setShuffle(true);
  setIds([]);
  order.clear();

  assert.equal(order.currentId, null);
  assert.equal(order.shuffle, true);
  assert.equal(order.canNext(true), false);
  assert.equal(order.canPrevious(true), false);
  assert.equal(order.next(true), null);

  setIds(["x", "y"]);
  order.select("x", true);
  assert.equal(order.next(false), "y");
  assert.equal(order.shuffle, false);
});

test("Repeat all works with a single track", () => {
  const { order } = setup(["a"]);
  order.select("a");
  order.setShuffle(true);
  assert.equal(order.canNext(true), true);
  assert.equal(order.next(true), "a");
  assert.equal(order.shuffle, true);
});
