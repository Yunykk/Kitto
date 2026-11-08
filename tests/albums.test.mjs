import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../src/lib/albums.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
}).outputText;
const { groupAlbums } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const track = (id, tags = {}) => ({ id, path: `${id}.mp3`, fileName: `${id}.mp3`, title: id, artist: "Artist", album: "Album", ...tags });

test("featured artists stay in an album when albumArtist matches", () => {
  const albums = groupAlbums([
    track("a", { artist: "Yeat", albumArtist: "Yeat", album: "COCOON" }),
    track("b", { artist: "Yeat, Drake", albumArtist: "Yeat", album: " cocoon " }),
    track("c", { artist: "Other", albumArtist: "Other", album: "COCOON" }),
  ]);
  assert.equal(albums.length, 2);
  assert.equal(albums.find(album => album.artist === "Yeat").tracks.length, 2);
});

test("album order uses disc, track number and natural filenames without mutating the library", () => {
  const tracks = [track("z", { discNumber: 2, trackNumber: 1 }), track("10"), track("2"), track("b", { trackNumber: 2 }), track("a", { trackNumber: 1 })];
  assert.deepEqual(groupAlbums(tracks)[0].tracks.map(item => item.id), ["a", "b", "2", "10", "z"]);
  assert.equal(tracks[0].id, "z");
});

test("album grouping skips empty titles and duplicate tracks while normalizing unicode and spacing", () => {
  const albums = groupAlbums([
    track("a", { album: " Cafe\u0301  music " }),
    track("b", { album: "Café music" }),
    track("a", { album: "Another" }),
    track("untagged", { album: null }),
  ]);
  assert.equal(albums.length, 1);
  assert.deepEqual(albums[0].tracks.map(item => item.id), ["a", "b"]);
});
