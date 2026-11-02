import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
const code = ts.transpileModule(
  readFileSync(new URL("../src/lib/collection.ts", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } },
).outputText;
const { filterAndSort, parseCollectionSettings, views } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`,
);
test("all four views restore independently and invalid sort options fall back", () => {
  assert.deepEqual(views.map(view => view.id), ["compact", "list", "grid", "covers"]);
  for (const view of views) assert.equal(parseCollectionSettings({ view: view.id, sort: "title" }, "music").view, view.id);
  assert.deepEqual(parseCollectionSettings({ view: "bad", sort: "artist" }, "playlists"), { view: "list", sort: "added" });
});
test("sorting and searching never mutate playlist playback order", () => {
  const items = [
    { id: "b", title: "Track 10", artist: "Other", subtitle: "Other Artist", paths: [], addedAt: 1 },
    { id: "a", title: "Track 2", artist: "First", subtitle: "First Artist", paths: [], addedAt: 2 },
  ];
  assert.deepEqual(filterAndSort(items, "", "title").map(item => item.id), ["a", "b"]);
  assert.deepEqual(filterAndSort(items, "TRACK 10 other", "order").map(item => item.id), ["b"]);
  assert.deepEqual(items.map(item => item.id), ["b", "a"]);
  assert.deepEqual(filterAndSort(items, "", "added").map(item => item.id), ["a", "b"]);
});
