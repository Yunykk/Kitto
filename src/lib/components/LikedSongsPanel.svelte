<script lang="ts">
    import type { DisplayTrack } from "../types";
    import type { FavoritesController } from "../favorites.svelte";
    import type { CollectionPreferences } from "../collection-settings.svelte";
    import { filterAndSort, type CollectionItem } from "../collection";
    import CollectionToolbar from "./CollectionToolbar.svelte";
    import CollectionList from "./CollectionList.svelte";

    let {
        tracks,
        favorites,
        preferences,
        currentId,
        isPlaying,
        onPlay,
        onback,
    }: {
        tracks: DisplayTrack[];
        favorites: FavoritesController;
        preferences: CollectionPreferences;
        currentId: string | null;
        isPlaying: boolean;
        onPlay: (
            ids: string[],
            name: string,
            startId?: string | null,
        ) => boolean;
        onback?: () => void;
    } = $props()

    let query = $state("");

    const byId = $derived(
        new Map(tracks.map((track) => [track.id, track])),
    );

    const items = $derived(
        favorites.ids.flatMap((id): CollectionItem[] => {
            const track = byId.get(id);

            if (!track) return [];

            return [{
                id: track.id,
                title: track.title,
                subtitle: track.artist ?? track.album ?? "",
                artist: track.artist,
                album: track.album,
                paths: [track.path],
                addedAt: favorites.likedAt(id) ?? 0,
                lastPlayedAt: track.lastPlayedAt,
            }];
        }),
    );

    const visible = $derived(
        filterAndSort(items, query, preferences.music.sort),
    );

    function play(startId: string | null = null) {
        onPlay(
            items.map((item) => item.id),
            "Liked songs",
            startId,
        );
    }
</script>

<div class="liked-panel">
    <div class="liked-heading">
        {#if onback}
            <button class="small-button" type="button" onclick={onback}>
                Back
            </button>
        {/if}

        <div class="liked-title">
            <h3>Liked songs</h3>
            <span>
                {items.length} {items.length === 1 ? "track" : "tracks"}
            </span>
        </div>

        <button
            class="small-button primary"
            type="button"
            disabled={!favorites.isReady || items.length === 0}
            onclick={() => play()}
        >
            Play
        </button>
    </div>

    {#if favorites.error}
        <p class="favorites-error" role="alert">{favorites.error}</p>
    {/if}

    {#if !favorites.isReady}
        <p class="metadata-status" role="status">Loadingggg...</p>
    {:else if items.length === 0}
        <div class="queue-empty">
            <h3>No liked songs yet, go add sum</h3>
            <p>Use the heart on a track to add it here</p>
        </div>
    {:else}
        <CollectionToolbar
            {query}
            placeholder="Search liked songs"
            view={preferences.music.view}
            sort={preferences.music.sort}
            sorts={["added", "recent", "title", "artist", "album"]}
            onquery={(value) => query = value}
            onview={(view) => preferences.set("music", { view })}
            onsort={(sort) => preferences.set("music", { sort })}
        />

        {#if visible.length === 0}
            <div class="queue-empty" role="status">
                <h3>Oi, no matching track</h3>
                <p>Maybe try a different name?</p>
            </div>
        {:else}
            <CollectionList
                items={visible}
                view={preferences.music.view}
                label="Liked songs"
                activeId={currentId}
                {isPlaying}
                {favorites}
                onopen={(id) => play(id)}
            />
        {/if}
    {/if}
</div>

<style>
  .liked-panel {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .liked-heading {
    display: flex;
    flex: none;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .liked-title {
    flex: 1;
    min-width: 0;
  }

  h3 {
    margin: 0 0 5px;
    font-size: 16px;
  }

  .liked-title span {
    color: var(--color-muted);
    font-size: 11px;
  }

  .small-button {
    flex: none;
    min-height: 34px;
    padding: 8px 12px;
    border: 1px solid var(--color-line);
    border-radius: 9px;
    color: var(--color-text);
    background: var(--color-raised);
    font-size: 11px;
    cursor: pointer;
  }

  .small-button:enabled:hover {
    border-color: var(--color-accent-ink);
  }

  .small-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .primary {
    border-color: transparent;
    color: var(--color-on-accent);
    background: var(--color-accent);
  }

  .favorites-error {
    margin: 0;
    color: var(--color-error);
    font-size: 11px;
    line-height: 1.5;
  }
</style>
