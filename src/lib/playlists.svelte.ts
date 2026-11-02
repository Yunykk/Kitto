import { onMount } from "svelte";

export type Playlist = {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
  lastPlayedAt: number;
};

const STORAGE_KEY = "kitto.playlists.v1";

function parsePlaylist(value: unknown, index: number): Playlist | null {
  if (typeof value !== "object" || value === null ||
      !("id" in value) || typeof value.id !== "string" || !value.id ||
      !("name" in value) || typeof value.name !== "string" ||
      !value.name.trim() || value.name.length > 80 ||
      !("trackIds" in value) || !Array.isArray(value.trackIds)) return null;
  const createdAt = "createdAt" in value && typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt) && value.createdAt >= 0 ? value.createdAt : index;
  const lastPlayedAt = "lastPlayedAt" in value && typeof value.lastPlayedAt === "number" &&
    Number.isFinite(value.lastPlayedAt) && value.lastPlayedAt >= 0 ? value.lastPlayedAt : 0;
  return {
    id: value.id,
    name: value.name.trim().replace(/\s+/g, " "),
    trackIds: [...new Set(value.trackIds.filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    ))],
    createdAt,
    lastPlayedAt,
  };
}

export function createPlaylists(getLibraryIds: () => string[] | null = () => null) {
  let playlists = $state<Playlist[]>([]);
  let error = $state("");
  let isReady = $state(false);

  onMount(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === null) return;
      const data: unknown = JSON.parse(saved);
      if (typeof data !== "object" || data === null ||
          !("version" in data) || data.version !== 1 ||
          !("playlists" in data) || !Array.isArray(data.playlists)) {
        throw new Error("Invalid playlist data.");
      }
      const seen = new Set<string>();
      playlists = data.playlists.map(parsePlaylist).filter((item): item is Playlist => {
        if (!item || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    } catch {
      error = "Could not load your playlists.";
    } finally {
      isReady = true;
    }
  });

  function save(next: Playlist[]): boolean {
    if (!isReady) return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, playlists: next }));
      playlists = next;
      error = "";
      return true;
    } catch {
      error = "Could not save your playlists.";
      return false;
    }
  }

  function validName(value: string): string | null {
    const name = value.trim().replace(/\s+/g, " ");
    if (!name || name.length > 80) {
      error = "Use a name between 1 and 80 characters.";
      return null;
    }
    return name;
  }

  function update(id: string, change: (playlist: Playlist) => Playlist): boolean {
    if (!playlists.some((playlist) => playlist.id === id)) {
      error = "Playlist not found.";
      return false;
    }
    return save(playlists.map((playlist) => playlist.id === id ? change(playlist) : playlist));
  }

  function create(value: string, ids: string[] = []): string | null {
    if (!isReady) return null;
    const name = validName(value);
    if (name === null) return null;
    const available = getLibraryIds();
    const playlist: Playlist = {
      id: crypto.randomUUID(), name,
      trackIds: [...new Set(ids.filter((id) => available === null || available.includes(id)))],
      createdAt: Date.now(), lastPlayedAt: 0,
    };
    return save([...playlists, playlist]) ? playlist.id : null;
  }

  function rename(id: string, value: string): boolean {
    const name = validName(value);
    return name !== null && update(id, (playlist) => ({ ...playlist, name }));
  }

  function remove(id: string): boolean {
    if (!playlists.some((playlist) => playlist.id === id)) return false;
    return save(playlists.filter((playlist) => playlist.id !== id));
  }

  function addTracks(id: string, trackIds: string[]): boolean {
    const library = getLibraryIds();
    const available = library === null ? null : new Set(library);
    return update(id, (playlist) => ({
      ...playlist,
      trackIds: [...new Set([...playlist.trackIds, ...trackIds.filter(
        (trackId) => trackId.length > 0 && (available === null || available.has(trackId)),
      )])],
    }));
  }

  function removeTrack(id: string, trackId: string): boolean {
    return update(id, (playlist) => ({
      ...playlist, trackIds: playlist.trackIds.filter((item) => item !== trackId),
    }));
  }

  function moveTrack(id: string, trackId: string, direction: -1 | 1): boolean {
    return update(id, (playlist) => {
      const trackIds = [...playlist.trackIds];
      const index = trackIds.indexOf(trackId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= trackIds.length) return playlist;
      [trackIds[index], trackIds[target]] = [trackIds[target], trackIds[index]];
      return { ...playlist, trackIds };
    });
  }

  function markPlayed(id: string): boolean {
    return update(id, (playlist) => ({ ...playlist, lastPlayedAt: Date.now() }));
  }

  $effect(() => {
    const library = getLibraryIds();
    const current = playlists;
    if (!isReady || library === null) return;
    const available = new Set(library);
    const next = current.map((playlist) => ({
      ...playlist, trackIds: playlist.trackIds.filter((id) => available.has(id)),
    }));
    if (next.some((playlist, index) => playlist.trackIds.length !== current[index].trackIds.length)) {
      save(next);
    }
  });

  return {
    get playlists() { return playlists; },
    get error() { return error; },
    get isReady() { return isReady; },
    clearError: () => { error = ""; },
    create, rename, remove, addTracks, removeTrack, moveTrack, markPlayed,
  };
}

export type PlaylistsController = ReturnType<typeof createPlaylists>;
