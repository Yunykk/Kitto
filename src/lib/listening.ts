import type {
  ListeningCredit, ListeningData, ListeningDay, ListeningHistoryEntry,
  ListeningSummary, ListeningTrack, ListeningTrackTotals,
} from "./listening-types";

export const LISTENING_STORAGE_KEY = "kitto.listening.v1";
export const HISTORY_LIMIT = 200;
export const DAY_LIMIT = 366;

export function emptyListeningData(): ListeningData {
  return { version: 1, seconds: 0, plays: 0, tracks: [], days: [], history: [] };
}

export function localDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const amount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const count = (value: unknown): value is number => amount(value) && Number.isSafeInteger(value);
const timestamp = (value: unknown): value is number => amount(value) && value <= 8.64e15;
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const optionalText = (value: unknown) => value === null || typeof value === "string";

function isTrack(value: unknown): value is ListeningTrack & Record<string, unknown> {
  return record(value) && text(value.id) && text(value.title) && optionalText(value.artist) && optionalText(value.album);
}

function isTrackTotal(value: unknown): value is ListeningTrackTotals {
  return record(value) && isTrack(value) && amount(value.seconds) && count(value.plays) && timestamp(value.lastPlayedAt);
}

function isHistory(value: unknown): value is ListeningHistoryEntry {
  return record(value) && isTrack(value) && text(value.sessionId) && timestamp(value.startedAt) &&
    timestamp(value.lastPlayedAt) && amount(value.seconds) && typeof value.qualified === "boolean";
}

function isDay(value: unknown): value is ListeningDay {
  if (!record(value) || typeof value.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return false;
  const date = new Date(`${value.date}T12:00:00`);
  return Number.isFinite(date.getTime()) && localDateKey(date.getTime()) === value.date &&
    amount(value.seconds) && count(value.plays);
}

function unique<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = key(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function parseListeningData(value: unknown): ListeningData | null {
  if (!record(value) || value.version !== 1 || !amount(value.seconds) || !count(value.plays) ||
      !Array.isArray(value.tracks) || !Array.isArray(value.days) || !Array.isArray(value.history)) return null;
  // Keep unreadable data until an explicit reset.
  if (!value.tracks.every(isTrackTotal) || !value.days.every(isDay) || !value.history.every(isHistory)) return null;
  return {
    version: 1,
    seconds: value.seconds,
    plays: value.plays,
    tracks: unique(value.tracks, (item) => item.id),
    days: unique(value.days, (item) => item.date).sort((a, b) => a.date.localeCompare(b.date)).slice(-DAY_LIMIT),
    history: unique(value.history, (item) => item.sessionId)
      .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt).slice(0, HISTORY_LIMIT),
  };
}

function splitDays(at: number, seconds: number): Map<string, number> {
  const segments = new Map<string, number>();
  let cursor = Math.max(0, at - seconds * 1000);
  while (cursor < at) {
    const next = new Date(cursor);
    next.setHours(24, 0, 0, 0);
    const end = Math.min(at, next.getTime());
    if (end <= cursor) break;
    const key = localDateKey(cursor);
    segments.set(key, (segments.get(key) ?? 0) + (end - cursor) / 1000);
    cursor = end;
  }
  return segments;
}

export function recordListening(data: ListeningData, credit: ListeningCredit): ListeningData {
  if (!isTrack(credit.track) || !text(credit.sessionId) || !timestamp(credit.at) ||
      !timestamp(credit.startedAt) || !amount(credit.seconds) || credit.seconds > 86400 ||
      (credit.seconds === 0 && !credit.qualified)) return data;
  const existing = data.history.find((entry) => entry.sessionId === credit.sessionId);
  if (!existing && credit.seconds === 0) return data;
  const play = credit.qualified && !existing?.qualified ? 1 : 0;
  const previous = data.tracks.find((track) => track.id === credit.track.id);
  const tags: ListeningTrack = {
    ...credit.track,
    artist: credit.track.artist?.trim() || previous?.artist || null,
    album: credit.track.album?.trim() || previous?.album || null,
  };
  const track: ListeningTrackTotals = {
    ...tags,
    seconds: (previous?.seconds ?? 0) + credit.seconds,
    plays: (previous?.plays ?? 0) + play,
    lastPlayedAt: credit.at,
  };
  const entry: ListeningHistoryEntry = {
    ...tags,
    sessionId: credit.sessionId,
    startedAt: existing?.startedAt ?? credit.startedAt,
    lastPlayedAt: credit.at,
    seconds: (existing?.seconds ?? 0) + credit.seconds,
    qualified: existing?.qualified === true || credit.qualified,
  };
  const days = new Map(data.days.map((day) => [day.date, { ...day }]));
  for (const [date, seconds] of splitDays(credit.at, credit.seconds)) {
    const day = days.get(date) ?? { date, seconds: 0, plays: 0 };
    day.seconds += seconds;
    days.set(date, day);
  }
  if (play) {
    const date = localDateKey(credit.at);
    const day = days.get(date) ?? { date, seconds: 0, plays: 0 };
    day.plays += play;
    days.set(date, day);
  }
  return {
    version: 1,
    seconds: data.seconds + credit.seconds,
    plays: data.plays + play,
    tracks: previous ? data.tracks.map((item) => item.id === track.id ? track : item) : [...data.tracks, track],
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-DAY_LIMIT),
    history: [entry, ...data.history.filter((item) => item.sessionId !== credit.sessionId)].slice(0, HISTORY_LIMIT),
  };
}

export function summarizeListening(
  data: ListeningData,
  availableIds: ReadonlySet<string>,
  now = Date.now(),
): ListeningSummary {
  const byDay = new Map(data.days.map((day) => [day.date, day]));
  const artists = new Map<string, { name: string; seconds: number; plays: number }>();
  for (const track of data.tracks) {
    const name = track.artist?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const artist = artists.get(key) ?? { name, seconds: 0, plays: 0 };
    artist.seconds += track.seconds;
    artist.plays += track.plays;
    artists.set(key, artist);
  }
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - 6 + index);
    const key = localDateKey(date.getTime());
    return {
      ...(byDay.get(key) ?? { date: key, seconds: 0, plays: 0 }),
      label: date.toLocaleDateString("en", { weekday: "short" }),
    };
  });
  const today = byDay.get(localDateKey(now));
  return {
    totals: { seconds: data.seconds, plays: data.plays, tracks: data.tracks.length, artists: artists.size },
    today: { seconds: today?.seconds ?? 0, plays: today?.plays ?? 0 },
    days,
    topTracks: [...data.tracks].sort((a, b) => b.plays - a.plays || b.seconds - a.seconds || b.lastPlayedAt - a.lastPlayedAt)
      .slice(0, 10).map((track) => ({
        trackId: track.id, title: track.title, artist: track.artist, seconds: track.seconds,
        plays: track.plays, lastPlayedAt: track.lastPlayedAt, available: availableIds.has(track.id),
      })),
    topArtists: [...artists.values()].sort((a, b) => b.plays - a.plays || b.seconds - a.seconds || a.name.localeCompare(b.name)).slice(0, 10),
    recent: data.history.slice(0, 20).map((entry) => ({
      sessionId: entry.sessionId, trackId: entry.id, title: entry.title, artist: entry.artist,
      seconds: entry.seconds, playedAt: entry.lastPlayedAt, qualified: entry.qualified,
      available: availableIds.has(entry.id),
    })),
  };
}
