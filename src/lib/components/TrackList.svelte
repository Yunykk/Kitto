<script lang="ts">
  import type { DisplayTrack, QueueTrack } from "../types";
  import type { PlaylistsController } from "../playlists.svelte";
  import { createCollectionSettings } from "../collection-settings.svelte";
  import { filterAndSort, type CollectionItem } from "../collection";
  import { provideLibraryArtwork } from "../library-artwork";
  import AddMusicButton from "./AddMusicButton.svelte";
  import PlaylistsPanel from "./PlaylistsPanel.svelte";
  import CollectionList from "./CollectionList.svelte";
  import CollectionToolbar from "./CollectionToolbar.svelte";
  import CollectionDialog from "./CollectionDialog.svelte";
  import PopoverButton from "./PopoverButton.svelte";
  import type { FavoritesController } from "../favorites.svelte";
  import LikedSongsPanel from "./LikedSongsPanel.svelte";

  let { tracks, queue, queueName, currentId, isPlaying, isIndexing, metadataError,
    isChoosingFiles, collections, favorites, onadd, onfiles, onselect, onqueueselect,
    onplayplaylist, onremove, onremovequeue, onclear, onclearqueue }: {
    tracks: DisplayTrack[];
    queue: QueueTrack[];
    queueName: string;
    currentId: string | null;
    isPlaying: boolean;
    isIndexing: boolean;
    metadataError: string;
    isChoosingFiles: boolean;
    collections: PlaylistsController;
    favorites: FavoritesController
    onadd: () => void;
    onfiles: () => Promise<string[] | null>;
    onselect: (id: string) => void;
    onqueueselect: (index: number) => void;
    onplayplaylist: (ids: string[], name: string, startId?: string | null) => boolean;
    onremove: (id: string) => void;
    onremovequeue: (id: string) => void;
    onclear: () => void;
    onclearqueue: () => void;
  } = $props();

  provideLibraryArtwork();
  const preferences = createCollectionSettings();
  let section = $state<
      "tracks" | "playlists" | "queue" | "favorites"
  >("tracks");
  let query = $state("");
  let confirmClear = $state(false);
  let newPlaylistTrackId = $state<string | null>(null);
  let notice = $state("");
  const items = $derived(tracks.map((track): CollectionItem => ({
    id: track.id, title: track.title, subtitle: track.artist ?? track.fileName,
    artist: track.artist, album: track.album, paths: [track.path],
    addedAt: track.addedAt, lastPlayedAt: track.lastPlayedAt,
  })));
  const byId = $derived(new Map(items.map((item) => [item.id, item])));
  const visible = $derived(filterAndSort(items, query, preferences.music.sort));
  const queueItems = $derived(queue.flatMap((track) => {
    const item = byId.get(track.id);
    return item ? [item] : [];
  }));

  function addToPlaylist(playlistId: string, trackId: string) {
    if (collections.addTracks(playlistId, [trackId])) {
      const name = collections.playlists.find((playlist) => playlist.id === playlistId)?.name;
      notice = `Added to ${name ?? "playlist"}.`;
    }
  }
  function newPlaylist(name: string): boolean {
    if (!newPlaylistTrackId) return false;
    const id = collections.create(name, [newPlaylistTrackId]);
    if (id) notice = `Added to ${name.trim()}.`;
    return id !== null;
  }
</script>

<aside class="library-panel" aria-labelledby="queue-heading">
  <div class="library-heading">
    <h2 id="queue-heading">Library <span class="queue-count">{tracks.length}</span></h2>
    <AddMusicButton {isChoosingFiles} {onadd} />
  </div>
  <div class="library-tabs" role="group" aria-label="Library sections">
    <button type="button" aria-pressed={section === "tracks"} disabled={isChoosingFiles}
      onclick={() => { section = "tracks"; notice = ""; }}>Music</button>
    <button type="button" aria-pressed={
      section === "playlists" ||
      (section === "favorites" && !favorites.separateTab)
    }
      onclick={() => { section = "playlists"; notice = ""; }}>Playlists</button>
    
    {#if favorites.separateTab}
      <button
        type="button"
        aria-pressed={section === "favorites"}
        disabled={isChoosingFiles}
        onclick={() => {
          section = "favorites";
          notice = "";
        }}
      >
        Liked songs
      </button>
    {/if}

    <button type="button" aria-pressed={section === "queue"} disabled={isChoosingFiles}
      onclick={() => { section = "queue"; notice = ""; }}>Queue <span>{queue.length}</span></button>
  </div>

  <div class="library-section" hidden={section !== "tracks"}>
    <CollectionToolbar {query} placeholder="Search tracks" view={preferences.music.view}
      sort={preferences.music.sort} sorts={["recent", "added", "title", "artist", "album"]}
      onquery={(value) => { query = value; notice = ""; }}
      onview={(view) => preferences.set("music", { view })}
      onsort={(sort) => preferences.set("music", { sort })} />
    <div class="library-status-row">
      <span>{query.trim() ? `${visible.length} / ${tracks.length}` : tracks.length} tracks</span>
      <button class="text-button" type="button" disabled={tracks.length === 0 || isChoosingFiles}
        onclick={() => confirmClear = true}>Clear library</button>
    </div>
    {#if notice}<p class="metadata-status" role="status">{notice}</p>
    {:else if isIndexing || metadataError}
      <p class="metadata-status" role="status">{isIndexing ? "Reading track details..." : metadataError}</p>
    {/if}
    {#if tracks.length === 0}
      <div class="queue-empty"><h3>Your library is empty</h3><p>Add a few tracks to get started.</p></div>
    {:else if visible.length === 0}
      <div class="queue-empty" role="status"><h3>No matching tracks</h3><p>Try a different name.</p></div>
    {:else}
      <CollectionList items={visible} view={preferences.music.view} label="Music"
        activeId={currentId} {isPlaying} onopen={onselect}>
        {#snippet actions(item)}
          <PopoverButton label={`Actions for ${item.title}`}>
            {#snippet children(close)}
              <button class="menu-action" type="button" onclick={() => { close(); onselect(item.id); }}>Play</button>
              <p class="menu-label">Add to playlist</p>
              {#each collections.playlists as playlist (playlist.id)}
                <button class="menu-action" type="button" disabled={playlist.trackIds.includes(item.id)}
                  onclick={() => { close(); addToPlaylist(playlist.id, item.id); }}>
                  {playlist.name}{playlist.trackIds.includes(item.id) ? " · Added" : ""}
                </button>
              {/each}
              <button class="menu-action" type="button" onclick={() => {
                close(); collections.clearError(); newPlaylistTrackId = item.id;
              }}>New playlist...</button>
              <button class="menu-action danger" type="button"
                onclick={() => { close(); onremove(item.id); }}>Remove from library</button>
            {/snippet}
          </PopoverButton>
        {/snippet}
      </CollectionList>
    {/if}
  </div>

  <div class="library-section" hidden={section !== "playlists"}>
    <PlaylistsPanel 
      {tracks} 
      {collections} 
      {favorites}
      {preferences} 
      {currentId} 
      {isPlaying}
      {isChoosingFiles} 
      {onfiles} 
      onplay={onplayplaylist}
      onliked={() => section = "favorites"}  
    />
  </div>

  <div class="library-section" hidden={section !== "favorites"}>
    <LikedSongsPanel
      {tracks}
      {favorites}
      {preferences}
      {currentId}
      {isPlaying}
      onPlay={onplayplaylist}
      onback={favorites.separateTab
        ? undefined
        : () => section = "playlists"}
      />
  </div>

  <div class="library-section" hidden={section !== "queue"}>
    <div class="library-status-row">
      <span class="queue-source" title={queueName}>Playing from {queueName}</span>
      <button class="text-button" type="button" disabled={queue.length === 0} onclick={onclearqueue}>Clear queue</button>
    </div>
    {#if queueItems.length === 0}
      <div class="queue-empty"><h3>Your queue is empty</h3><p>Play a track or open a playlist.</p></div>
    {:else}
      <CollectionList items={queueItems} view="list" label="Playback queue"
        activeId={currentId} {isPlaying}
        onopen={(id) => onqueueselect(queue.findIndex((track) => track.id === id))}>
        {#snippet actions(item)}
          <PopoverButton label={`Actions for ${item.title}`}>
            {#snippet children(close)}
              <button class="menu-action danger" type="button"
                onclick={() => { close(); onremovequeue(item.id); }}>Remove from queue</button>
            {/snippet}
          </PopoverButton>
        {/snippet}
      </CollectionList>
    {/if}
  </div>
  {#if preferences.error}<p class="library-error" role="alert">{preferences.error}</p>{/if}
  {#if collections.error && section !== "playlists"}<p class="library-error" role="alert">{collections.error}</p>{/if}
</aside>

<CollectionDialog open={confirmClear} title="Clear your library?"
  message="All tracks will be removed from Kitto and your playlists. Your audio files will stay on disk."
  confirmLabel="Clear library" onsubmit={() => { onclear(); return true; }}
  onclose={() => confirmClear = false} />
<CollectionDialog open={newPlaylistTrackId !== null} title="New playlist" mode="name"
  confirmLabel="Create" error={collections.error} onsubmit={newPlaylist}
  onclose={() => newPlaylistTrackId = null} />

<style>
  .library-tabs { display: flex; flex: none; gap: 4px; margin-bottom: 14px; padding: 4px; border: 1px solid var(--color-line); border-radius: 12px; background: var(--color-panel); }
  .library-tabs button { flex: 1; min-width: 0; padding: 8px 4px; border: 0; border-radius: 9px; color: var(--color-muted); background: transparent; font-size: 11px; cursor: pointer; }
  .library-tabs button[aria-pressed="true"] { color: var(--color-text); background: var(--color-raised); box-shadow: var(--shadow-soft); }
  .library-tabs button:disabled { opacity: .5; cursor: not-allowed; }
  .library-tabs span { margin-left: 3px; font-size: 10px; }
  .library-section { display: flex; flex: 1; flex-direction: column; gap: 12px; min-width: 0; min-height: 0; overflow: hidden; }
  .library-section[hidden] { display: none; }
  .library-section:not([hidden]) { animation: section-in 160ms ease-out; }
  .library-status-row { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; color: var(--color-muted); font-size: 10px; }
  .text-button { flex: none; padding: 3px 0; border: 0; color: var(--color-muted); background: transparent; font-size: 10px; cursor: pointer; }
  .text-button:enabled:hover { color: var(--color-accent-ink); }
  .text-button:disabled { opacity: .4; cursor: not-allowed; }
  .queue-source { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .library-error { flex: none; margin: 5px 0 0; color: var(--color-error); font-size: 11px; line-height: 1.5; }
  @keyframes section-in { from { opacity: 0; } to { opacity: 1; } }
  @media (max-width: 760px) {
    .library-heading { display: none; }
    .library-tabs { margin-bottom: 8px; }
    .library-section { gap: 8px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .library-section:not([hidden]) { animation: none; }
  }
</style>
