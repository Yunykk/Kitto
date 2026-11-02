import { onMount } from "svelte";
import {
  parseCollectionSettings,
  type CollectionScope,
  type CollectionSettings,
} from "./collection";

const KEY = "kitto.collection-settings.v1";
export function createCollectionSettings() {
  let music = $state(parseCollectionSettings(null, "music"));
  let playlists = $state(parseCollectionSettings(null, "playlists"));
  let error = $state("");
  let ready = false;
  onMount(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (saved?.version === 1) {
        music = parseCollectionSettings(saved.music, "music");
        playlists = parseCollectionSettings(saved.playlists, "playlists");
      }
    } catch {
      error = "Could not restore your library view.";
    }
    ready = true;
  });
  function set(scope: CollectionScope, changes: Partial<CollectionSettings>) {
    if (!ready) return;
    const current = scope === "music" ? music : playlists;
    const next = parseCollectionSettings({ ...current, ...changes }, scope);
    if (scope === "music") music = next;
    else playlists = next;
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, music, playlists }));
      error = "";
    } catch {
      error = "Could not save your library view.";
    }
  }
  return {
    get music() { return music; },
    get playlists() { return playlists; },
    get error() { return error; },
    set,
  };
}
export type CollectionPreferences = ReturnType<typeof createCollectionSettings>;
