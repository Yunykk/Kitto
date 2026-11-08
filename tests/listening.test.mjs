import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

function moduleUrl(path) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
}
const { emptyListeningData, recordListening, parseListeningData, summarizeListening, localDateKey, HISTORY_LIMIT } = await import(moduleUrl("../src/lib/listening.ts"));
const { createListeningTracker } = await import(moduleUrl("../src/lib/listening-tracker.ts"));
const track = { id: "a", title: "Sunrise", artist: "Artist", album: "Album" };
const base = new Date(2026, 10, 2, 12).getTime();

function harness(duration = 120) {
  let time = 0, serial = 0;
  let data = emptyListeningData();
  const credits = [];
  const tracker = createListeningTracker((credit) => { credits.push(credit); data = recordListening(data, credit); }, {
    monotonic: () => time, wall: () => base + time, id: () => `session-${++serial}`,
  });
  let state = { loadId: 1, position: 0, duration, active: true, seeking: false, ended: false, playbackRate: 1, track };
  const update = (elapsed, patch = {}) => { time += elapsed * 1000; state = { ...state, ...patch }; tracker.sample(state); };
  update(0);
  return { tracker, update, credits, get data() { return data; } };
}

test("listening counts actual playback and qualifies once across pause and resume", () => {
  const h = harness();
  h.update(29, { position: 29 });
  assert.equal(h.data.seconds, 29);
  assert.equal(h.data.plays, 0);
  h.update(1, { position: 30 });
  assert.equal(h.data.plays, 1);
  h.update(0, { active: false });
  h.update(60);
  h.update(0, { active: true });
  h.update(2, { position: 32 });
  assert.equal(h.data.seconds, 32);
  assert.equal(h.data.plays, 1);
  assert.equal(h.data.history.length, 1);
});

test("short tracks qualify after half their content; quick skips remain partial", () => {
  const h = harness(10);
  h.update(4, { position: 4 });
  assert.equal(h.data.plays, 0);
  h.update(1, { position: 5 });
  assert.equal(h.data.plays, 1);
  h.update(0, { loadId: 2, position: 0, track: { ...track, id: "b" } });
  h.update(2, { position: 2 });
  h.update(0, { active: false });
  assert.equal(h.data.plays, 1);
  assert.equal(h.data.history[0].qualified, false);
  assert.equal(h.data.history[0].seconds, 2);
});

test("buffering, stalled media and long sleeping gaps do not inflate listening", () => {
  const h = harness();
  h.update(2, { position: 2, active: false });
  h.update(100, { position: 2 });
  h.update(0, { active: true });
  h.update(500, { position: 3 });
  assert.equal(h.data.seconds, 3);
  assert.equal(h.data.plays, 0);
});

test("seeks in both directions and unexplained jumps never count as listened music", () => {
  const h = harness();
  h.update(1, { position: 1 });
  h.update(0, { position: 100, seeking: true, active: false });
  h.update(0, { seeking: false, active: true });
  h.update(1, { position: 101 });
  h.update(0, { position: 0, seeking: true, active: false });
  h.update(0, { seeking: false, active: true });
  h.update(1, { position: 1 });
  h.update(1, { position: 80 });
  assert.equal(h.data.seconds, 3);
  assert.equal(h.data.plays, 0);
});

test("repeat one creates a new listening session after ended and seek events", () => {
  const h = harness(4);
  h.update(4, { position: 4, ended: true, active: false });
  assert.equal(h.data.plays, 1);
  h.update(0, { position: 0, ended: false, seeking: true, active: false });
  h.update(0, { seeking: false, active: true });
  h.update(2, { position: 2 });
  assert.equal(h.data.plays, 2);
  assert.equal(h.data.seconds, 6);
  assert.equal(h.data.history.length, 2);
});

test("playback speed affects content progress without doubling listening time", () => {
  const h = harness(20);
  h.update(0, { playbackRate: 2 });
  h.update(5, { position: 10 });
  assert.equal(h.data.seconds, 5);
  assert.equal(h.data.plays, 1);
});

test("fractional tail is flushed and reset cannot restore pre-reset progress", () => {
  const h = harness(10);
  h.update(.25, { position: .25 });
  assert.equal(h.data.seconds, 0);
  h.tracker.flush();
  assert.equal(h.data.seconds, .25);
  h.tracker.flush();
  assert.equal(h.data.seconds, .25);
  h.tracker.reset();
  h.update(0);
  h.update(1, { position: 1.25 });
  assert.equal(h.data.history.length, 2);
  assert.equal(h.data.history[0].seconds, 1);
});

test("late metadata enriches statistics without starting or counting a second play", () => {
  const h = harness();
  h.update(1, { position: 1 });
  h.update(1, { position: 2, track: { ...track, title: "Tagged Sunrise", artist: "Real Artist" } });
  assert.equal(h.data.tracks[0].title, "Tagged Sunrise");
  assert.equal(h.data.history[0].artist, "Real Artist");
  assert.equal(h.data.history.length, 1);
});

test("daily time splits at local midnight and qualified plays belong to the completion day", () => {
  const at = new Date(2026, 10, 3, 0, 0, 2).getTime();
  const data = recordListening(emptyListeningData(), { sessionId: "midnight", track, startedAt: at - 4000, at, seconds: 4, qualified: true });
  assert.deepEqual(data.days, [
    { date: "2026-11-02", seconds: 2, plays: 0 },
    { date: "2026-11-03", seconds: 2, plays: 1 },
  ]);
  assert.equal(localDateKey(at), "2026-11-03");
});

test("history retention does not erase all-time totals and duplicate qualification is harmless", () => {
  let data = emptyListeningData();
  for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
    data = recordListening(data, { sessionId: `s${i}`, track, startedAt: base + i * 1000, at: base + i * 1000 + 500, seconds: .5, qualified: true });
  }
  assert.equal(data.history.length, HISTORY_LIMIT);
  assert.equal(data.plays, HISTORY_LIMIT + 5);
  assert.equal(data.seconds, (HISTORY_LIMIT + 5) * .5);
  const last = data.history[0];
  data = recordListening(data, { sessionId: last.sessionId, track, startedAt: last.startedAt, at: last.lastPlayedAt + 1000, seconds: 1, qualified: true });
  assert.equal(data.plays, HISTORY_LIMIT + 5);
});

test("summary retains removed tracks as unavailable, groups artist case and fills missing dates", () => {
  let data = emptyListeningData();
  for (const [index, item] of [track, { ...track, id: "b", artist: "artist" }].entries()) {
    data = recordListening(data, { sessionId: String(index), track: item, startedAt: base, at: base + 1000, seconds: 1, qualified: true });
  }
  const snapshot = JSON.stringify(data);
  const summary = summarizeListening(data, new Set(["b"]), base);
  assert.equal(summary.totals.artists, 1);
  assert.equal(summary.topArtists[0].plays, 2);
  assert.equal(summary.topTracks.find(item => item.trackId === "a").available, false);
  assert.equal(summary.topTracks.find(item => item.trackId === "b").available, true);
  assert.equal(summary.days.length, 7);
  assert.equal(summary.days.at(-1).seconds, 2);
  assert.equal(summary.days.slice(0, -1).every(day => day.seconds === 0), true);
  assert.equal(JSON.stringify(data), snapshot);
});

test("storage validation rejects unknown versions, invalid dates and non-finite counters", () => {
  const empty = emptyListeningData();
  assert.deepEqual(parseListeningData(JSON.parse(JSON.stringify(empty))), empty);
  assert.equal(parseListeningData({ ...empty, version: 2 }), null);
  assert.equal(parseListeningData({ ...empty, seconds: Infinity }), null);
  assert.equal(parseListeningData({ ...empty, days: [{ date: "2026-02-31", seconds: 1, plays: 1 }] }), null);
  assert.equal(parseListeningData({ ...empty, history: [{ id: "bad" }] }), null);
  assert.equal(recordListening(empty, { sessionId: "bad", track, startedAt: base, at: base, seconds: -1, qualified: true }), empty);
});
