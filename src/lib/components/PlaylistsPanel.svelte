<script lang="ts">
  import { onDestroy } from "svelte";
  import type { DisplayTrack } from "../types";
  import type { Playlist, PlaylistsController } from "../playlists.svelte";
  import type { CollectionPreferences } from "../collection-settings.svelte";
  import { filterAndSort, type CollectionItem, type CollectionSort } from "../collection";
  import PlaylistTrackPicker from "./PlaylistTrackPicker.svelte";
  import CollectionToolbar from "./CollectionToolbar.svelte";
  import CollectionList from "./CollectionList.svelte";
  import PopoverButton from "./PopoverButton.svelte";
  import CollectionDialog from "./CollectionDialog.svelte";
  import {
    LIKED_SONGS_ID,
    type FavoritesController,
  } from "../favorites.svelte"

  let { tracks, collections, favorites, preferences, currentId, isPlaying, isChoosingFiles, onfiles, onplay, onliked }: {
    tracks: DisplayTrack[];
    collections: PlaylistsController;
    favorites: FavoritesController
    onliked: () => void;
    preferences: CollectionPreferences;
    currentId: string | null;
    isPlaying: boolean;
    isChoosingFiles: boolean;
    onfiles: () => Promise<string[] | null>;
    onplay: (ids: string[], name: string, startId?: string | null) => boolean;
  } = $props();

  let selectedId = $state<string | null>(null);
  let addView = $state<"sources" | "library" | null>(null);
  let query = $state("");
  let trackQuery = $state("");
  let trackSort = $state<CollectionSort>("order");
  let fileError = $state("");
  let dialogMode = $state<"create" | "rename" | "delete" | null>(null);
  let dialogId = $state<string | null>(null);
  let disposed = false;
  onDestroy(() => { disposed = true; });

  const selected = $derived(collections.playlists.find((item) => item.id === selectedId) ?? null);
  const dialogPlaylist = $derived(collections.playlists.find((item) => item.id === dialogId) ?? null);
  const byId = $derived(new Map(tracks.map((track) => [track.id, track])));
  const likedItem = $derived.by(() : CollectionItem => {
    const available = favorites.ids.flatMap((id) => {
        const track = byId.get(id);

        return track ? [track] : [];
    });

    return {
        id: LIKED_SONGS_ID,
        title: "Liked songs",
        subtitle: `${available.length} tracks · Pinned`,
        paths: available.slice(0, 4).map((track) => track.path),
    };
  });

  const collectionCount = $derived(
    collections.playlists.length +
        (favorites.separateTab ? 0 : 1),
  );

  const items = $derived(collections.playlists.map((playlist): CollectionItem => {
    const available = playlist.trackIds.flatMap((id) => {
      const track = byId.get(id);
      return track ? [track] : [];
    });
    return {
      id: playlist.id, title: playlist.name,
      subtitle: `${available.length} ${available.length === 1 ? "track" : "tracks"}`,
      paths: available.slice(0, 4).map((track) => track.path),
      addedAt: playlist.createdAt, lastPlayedAt: playlist.lastPlayedAt,
    };
  }));
  const visible = $derived.by(() => {
    const regular = filterAndSort(
        items,
        query,
        preferences.playlists.sort,
    );

    if (favorites.separateTab) return regular;

    const pinned = filterAndSort(
        [likedItem],
        query,
        preferences.playlists.sort,
    );

    return [...pinned, ...regular];
  });

  const playlistItems = $derived((selected?.trackIds ?? []).flatMap((id): CollectionItem[] => {
    const track = byId.get(id);
    return track ? [{
      id: track.id, title: track.title, subtitle: track.artist ?? track.fileName,
      artist: track.artist, album: track.album, paths: [track.path],
      addedAt: track.addedAt, lastPlayedAt: track.lastPlayedAt,
    }] : [];
  }));
  const visibleTracks = $derived(filterAndSort(playlistItems, trackQuery, trackSort));

  function open(id: string) {
    if (id === LIKED_SONGS_ID) {
        onliked();
        return;
    }
    selectedId = id;
    addView = null;
    trackQuery = "";
    trackSort = "order";
    fileError = "";
  }
  function back() {
    if (isChoosingFiles) return;
    fileError = "";
    if (addView === "library") addView = "sources";
    else if (addView === "sources") addView = null;
    else selectedId = null;
  }
  function edit(mode: "create" | "rename" | "delete", id: string | null = null) {
    collections.clearError();
    dialogId = id;
    dialogMode = mode;
  }
  function submitDialog(name: string): boolean {
    if (dialogMode === "create") {
      const id = collections.create(name);
      if (!id) return false;
      open(id);
      return true;
    }
    const target = dialogPlaylist;
    if (!target) return false;
    if (dialogMode === "rename") return collections.rename(target.id, name);
    const removed = collections.remove(target.id);
    if (removed && selectedId === target.id) selectedId = null;
    return removed;
  }
  function play(playlist: Playlist, startId: string | null = null) {
    if (onplay(playlist.trackIds, playlist.name, startId)) collections.markPlayed(playlist.id);
  }
  function addSelected(ids: string[]) {
    if (selected && collections.addTracks(selected.id, ids)) addView = null;
  }
  async function addFiles() {
    const id = selectedId;
    if (!id || isChoosingFiles) return;
    fileError = "";
    const ids = await onfiles();
    if (ids === null) {
      if (!disposed) fileError = "Could not import the selected files.";
      return;
    }
    if (ids.length > 0 && collections.addTracks(id, ids) && !disposed) addView = null;
  }
  function move(trackId: string, direction: -1 | 1) {
    if (selected && collections.moveTrack(selected.id, trackId, direction)) trackSort = "order";
  }
</script>

<div class="playlists-panel">
  {#if fileError || collections.error}
    <p class="playlist-error" role="alert">{fileError || collections.error}</p>
  {/if}
  {#if !collections.isReady}
    <p class="metadata-status" role="status">Loading playlists...</p>
  {:else if selected}
    <div class="playlist-header">
      <button class="small-button" type="button" disabled={isChoosingFiles} onclick={back}>Back</button>
      <div class="playlist-heading">
        <h3>{selected.name}</h3>
        <span>{playlistItems.length} {playlistItems.length === 1 ? "track" : "tracks"}</span>
      </div>
      <PopoverButton label="Playlist actions" disabled={isChoosingFiles}>
        {#snippet children(close)}
          <button class="menu-action" type="button" onclick={() => { close(); edit("rename", selected.id); }}>Rename</button>
          <button class="menu-action danger" type="button" onclick={() => { close(); edit("delete", selected.id); }}>Delete playlist</button>
        {/snippet}
      </PopoverButton>
    </div>
    {#if addView === "sources"}
      <div class="playlist-sources">
        <button class="small-button" type="button" disabled={isChoosingFiles} onclick={() => { fileError = ""; addView = "library"; }}>From library</button>
        <button class="small-button" type="button" disabled={isChoosingFiles} onclick={addFiles}>{isChoosingFiles ? "Opening..." : "From files"}</button>
      </div>
    {:else if addView === "library"}
      <PlaylistTrackPicker {tracks} existingIds={selected.trackIds} onadd={addSelected} oncancel={() => addView = null} />
    {:else}
      <div class="playlist-controls">
        <button class="small-button primary" type="button" disabled={playlistItems.length === 0} onclick={() => play(selected)}>Play</button>
        <button class="small-button" type="button" disabled={isChoosingFiles} onclick={() => { fileError = ""; addView = "sources"; }}>Add tracks</button>
      </div>
      {#if playlistItems.length > 0}
        <CollectionToolbar query={trackQuery} placeholder="Search playlist" view={preferences.music.view}
          sort={trackSort} sorts={["order", "title", "artist", "album"]}
          onquery={(value) => trackQuery = value}
          onview={(view) => preferences.set("music", { view })}
          onsort={(sort) => trackSort = sort} />
      {/if}
      {#if playlistItems.length === 0}
        <div class="queue-empty"><h3>No tracks yet</h3><p>Add tracks from your library or choose audio files.</p></div>
      {:else if visibleTracks.length === 0}
        <div class="queue-empty" role="status"><h3>No matching tracks</h3><p>Try a different name.</p></div>
      {:else}
        <CollectionList
            items={visibleTracks}
            view={preferences.music.view}
            label="Playlist tracks"
            activeId={currentId}
            {isPlaying}
            {favorites}
            onopen={(id) => play(selected, id)}
        >
          {#snippet actions(item)}
            <PopoverButton label={`Actions for ${item.title}`}>
              {#snippet children(close)}
                <button class="menu-action" type="button" disabled={selected.trackIds.indexOf(item.id) === 0}
                  onclick={() => { close(); move(item.id, -1); }}>Move up</button>
                <button class="menu-action" type="button" disabled={selected.trackIds.indexOf(item.id) === selected.trackIds.length - 1}
                  onclick={() => { close(); move(item.id, 1); }}>Move down</button>
                <button class="menu-action danger" type="button"
                  onclick={() => { close(); collections.removeTrack(selected.id, item.id); }}>Remove from playlist</button>
              {/snippet}
            </PopoverButton>
          {/snippet}
        </CollectionList>
      {/if}
    {/if}
  {:else}
    <div class="playlist-list-heading">
      <span>
        {collectionCount} {collectionCount === 1 ? "playlist" : "playlists"}
    </span>
      <button class="small-button" type="button" disabled={isChoosingFiles} onclick={() => edit("create")}>New playlist</button>
    </div>
    <CollectionToolbar {query} placeholder="Search playlists" view={preferences.playlists.view}
      sort={preferences.playlists.sort} sorts={["recent", "added", "title"]}
      onquery={(value) => query = value}
      onview={(view) => preferences.set("playlists", { view })}
      onsort={(sort) => preferences.set("playlists", { sort })} />
    {#if collectionCount === 0}
      <div class="queue-empty"><h3>No playlists yet</h3><p>Create a playlist to collect your music.</p></div>
    {:else if visible.length === 0}
      <div class="queue-empty" role="status"><h3>No matching playlists</h3><p>Try a different name.</p></div>
    {:else}
      <CollectionList items={visible} view={preferences.playlists.view} label="Playlists" action="Open" onopen={open}>
        {#snippet actions(item)}
            {#if item.id !== LIKED_SONGS_ID}
                <PopoverButton label={`Action for ${item.title}`}>
                    {#snippet children(close)}
                        <button
                            class="menu-action"
                            type="button"
                            disabled={!collections.playlists.find(
                                (playlist) => playlist.id === item.id
                            )?.trackIds.length}
                            onclick={() => {
                                close();

                                const playlist = collections.playlists.find(
                                    (entry) => entry.id === item.id,
                                );

                                if (playlist) play(playlist);
                            }}
                        >
                            Play
                        </button>

                        <button
                            class="menu-action"
                            type="button"
                            onclick={() => {
                                close();
                                edit("rename", item.id);
                            }}
                        >
                            Rename
                        </button>

                        <button
                            class="menu-action danget"
                            type="button"
                            onclick={() => {
                                close();
                                edit("delete", item.id);
                            }}
                        >
                            Delete playlist
                        </button>
                    {/snippet}
                </PopoverButton>
            {/if}
        {/snippet}
      </CollectionList>
    {/if}
  {/if}
</div>

<CollectionDialog open={dialogMode !== null}
  title={dialogMode === "create" ? "New playlist" : dialogMode === "rename" ? "Rename playlist" : "Delete playlist?"}
  mode={dialogMode === "delete" ? "confirm" : "name"}
  initialValue={dialogMode === "rename" ? dialogPlaylist?.name ?? "" : ""}
  message={dialogMode === "delete" ? "Your tracks will stay in the library. The current queue will keep playing." : ""}
  confirmLabel={dialogMode === "create" ? "Create" : dialogMode === "rename" ? "Save" : "Delete"}
  error={collections.error} onsubmit={submitDialog} onclose={() => dialogMode = null} />

<style>
  .playlists-panel { display: flex; flex: 1; flex-direction: column; gap: 12px; min-width: 0; min-height: 0; overflow: hidden; }
  .playlist-header { display: flex; flex: none; align-items: flex-start; gap: 10px; min-width: 0; }
  .playlist-heading { flex: 1; min-width: 0; }
  .playlist-heading h3 { margin: 0 0 5px; overflow-wrap: anywhere; font-size: 16px; line-height: 1.3; }
  .playlist-heading span { color: var(--color-muted); font-size: 11px; }
  .playlist-list-heading { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 8px; }
  .playlist-controls { display: flex; flex: none; gap: 8px; }
  .playlist-sources { display: grid; flex: none; gap: 8px; }
  .small-button { min-height: 34px; padding: 8px 12px; border: 1px solid var(--color-line); border-radius: 9px; color: var(--color-text); background: var(--color-raised); font-size: 11px; cursor: pointer; }
  .small-button:enabled:hover { border-color: var(--color-accent-ink); background-color: var(--color-accent-soft); }
  .small-button:disabled { opacity: .5; cursor: not-allowed; }
  .primary { border-color: transparent; color: var(--color-on-accent); background: var(--color-accent); }
  .playlist-error { flex: none; margin: 0; color: var(--color-error); font-size: 11px; line-height: 1.5; }
  @media (max-width: 760px) {
    .playlists-panel { gap: 8px; }
  }
</style>
