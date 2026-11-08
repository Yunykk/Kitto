<script lang="ts">
    import type { DisplayTrack } from "../types"; 
    import type { CollectionItem } from "../collection"; 
    import type { FavoritesController } from "../favorites.svelte";
    import { groupAlbums, type Album } from "../albums";
    import CollectionList from "./CollectionList.svelte";

    let {
        tracks,
        currentId,
        isPlaying,
        isIndexing,
        metadataError,
        favorites,
        onplay,
    }: {
        tracks: DisplayTrack[];
        currentId: string | null;
        isPlaying: boolean;
        isIndexing: boolean;
        metadataError: string;
        favorites: FavoritesController;
        onplay: (
            ids: string[],
            name: string,
            startId?: string | null,
        ) => boolean;
    } = $props();

    let selectedId = $state<string | null>(null);
    let query = $state("");

    const albums = $derived(groupAlbums(tracks));
    const selected = $derived(
        albums.find((album) => album.id === selectedId) ?? null,
    );

    const visibleAlbums = $derived.by(() => {
        const search = query.trim().toLowerCase();

        return albums.filter((album) =>
            `${album.title} ${album.artist ?? ""}`
                .toLowerCase()
                .includes(search),
        );
    });

    function trackCount(count: number): string {
        return `${count} ${count === 1 ? "track" : "tracks"}`;
    }

    const albumItems = $derived(
        visibleAlbums.map((album): CollectionItem => ({
            id: album.id,
            title: album.title,
            subtitle:
                `${album.artist ?? "Unknown artist"} · ` +
                trackCount(album.tracks.length),
            paths: album.tracks.slice(0, 1).map((track) => track.path),
        })),
    );

    const hasMultipleDiscs = $derived.by(() => {
        const discs = new Set(
            (selected?.tracks ?? []).map((track) => track.discNumber ?? 1),
        );

        return discs.size > 1;
    });

    const trackItems = $derived(
        (selected?.tracks ?? []).map((track): CollectionItem => ({
            id: track.id,
            title: track.title,
            subtitle: track.artist ?? track.fileName,
            artist: track.artist,
            album: track.album,
            paths: [track.path],
            trackNumber: track.trackNumber ?? null,
            group: hasMultipleDiscs
                ? `Disc ${track.discNumber ?? 1}`
                : undefined,
        })),
    );

    const activeAlbumId = $derived(
        albums.find((album) =>
            album.tracks.some((track) => track.id === currentId),
        )?.id ?? null,
    );

    function play(album: Album, startId?: string): void {
        onplay(
            album.tracks.map((track) => track.id),
            album.title,
            startId,
        );
    }

    export function navigateBack(): boolean {
        if (selectedId !== null) {
            selectedId = null;
            return true;
        }

        if (query) {
            query = ""
            return true
        }

        return false
    }


    $effect(() => {
        if (!isIndexing && selectedId !== null && selected === null) {
            selectedId = null;
        }
    });
</script>


<div class="albums-panel">
    {#if isIndexing}
        <p class="album-status" role="status">Reading albums…</p>
    {:else if metadataError}
        <p class="album-error" role="alert">{metadataError}</p>
    {/if}


    {#if selected}
        <div class="album-header">
            <button
                class="small-button"
                type="button"
                onclick={() => selectedId = null}
            >
                Back
            </button>
            
            <div class="album-heading">
                <h3>{selected.title}</h3>
                <p>{selected.artist ?? "Unknown artist"}</p>
                <span>{trackCount(selected.tracks.length)}</span>
            </div>

            <button
                class="album-play"
                type="button"
                aria-label={`Play ${selected.title}`}
                title="Play album"
                disabled={selected.tracks.length === 0}
                onclick={() => {
                    if (selected) play(selected);
                }}
            >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                </svg>
            </button>
        </div>

        <CollectionList
            items={trackItems}
            view="list"
            label="Album tracks"
            activeId={currentId}
            {isPlaying}
            {favorites}
            onopen={(id) => {
                if (selected) play(selected, id);
            }}
        />
    {:else}
        <input
            class="album-search"
            type="search"
            aria-label="Search albums"
            placeholder="Search albums or artists"
            bind:value={query}
        />

        <p class="album-status">
            {visibleAlbums.length}
            {visibleAlbums.length === 1 ? "album" : "albums"}
        </p>

        {#if albums.length === 0}
            <div class="queue-empty">
                <h3>{isIndexing ? "Reading albums..." : "No albums yet"}</h3>
                <p>Albums appear when your tracks contain album tags</p>
            </div>

        {:else if visibleAlbums.length === 0}
            <div class="queue-empty" role="status">
                <h3>No matching albums</h3>
                <p>Try a different album or artist</p>
            </div>

        {:else}
            <CollectionList
                items={albumItems}
                view="grid"
                label="Albums"
                action="Open album"
                activeId={activeAlbumId}
                {isPlaying}
                onopen={(id) => selectedId = id}
            />
        {/if}
    {/if}
</div>


<style>
  .albums-panel {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .album-search {
    flex: none;
    width: 100%;
    min-height: 36px;
    padding: 8px 10px;
    border: 1px solid var(--color-line);
    border-radius: 10px;
    color: var(--color-text);
    background: var(--color-surface);
    font: inherit;
    font-size: 12px;
  }

  .album-header {
    display: flex;
    flex: none;
    align-items: flex-start;
    gap: 12px;
  }

  .album-heading {
    flex: 1;
    min-width: 0;
  }

  .album-heading h3 {
    margin: 0 0 5px;
    overflow-wrap: anywhere;
    font-size: 16px;
  }

  .album-heading p {
    margin: 0 0 5px;
    overflow-wrap: anywhere;
    color: var(--color-muted);
    font-size: 12px;
  }

  .album-heading span,
  .album-status {
    color: var(--color-muted);
    font-size: 11px;
  }

  .album-status,
  .album-error {
    flex: none;
    margin: 0;
  }

  .album-error {
    color: var(--color-error);
    font-size: 11px;
  }

  .small-button {
    flex: none;
    min-height: 36px;
    padding: 8px 12px;
    border: 1px solid var(--color-line);
    border-radius: 9px;
    color: var(--color-text);
    background: var(--color-raised);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .small-button:enabled:hover {
    border-color: var(--color-accent-ink);
    background: var(--color-accent-soft);
  }

  .small-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

    .album-play {
    display: grid;
    place-items: center;
    flex: none;
    align-self: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    color: var(--color-on-accent);
    background: var(--color-accent);
    box-shadow: var(--shadow-soft);
    cursor: pointer;
    transition: filter 160ms ease, transform 160ms ease;
    }

    .album-play svg {
    width: 24px;
    height: 24px;
    margin-left: 2px;
    }

    .album-play:enabled:hover {
    filter: brightness(1.08);
    transform: translateY(-1px);
    }

    .album-play:enabled:active {
    transform: scale(0.96);
    }

    .album-play:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    }

    @media (prefers-reduced-motion: reduce) {
    .album-play {
        transition: none;
    }

    .album-play:enabled:hover,
    .album-play:enabled:active {
        transform: none;
    }
    }
</style>
