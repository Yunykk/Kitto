<script lang="ts">
    import { createPlaylists } from "../playlists.svelte"

    const collections = createPlaylists();

    let name = $state("");

    let selectedId = $state<string | null> (null);

    const selectedPlaylist = $derived(
        collections.playlists.find((playlist) => playlist.id === selectedId) ??
            null,
    );

    function handleCreate(event: SubmitEvent) {
        event.preventDefault();

        const id = collections.create(name);

        if (id !== null) {
            name = "";
        }

        if (id !== null) {
            name = "";
            openPlaylist(id);
        }
    }


    function openPlaylist(id: string) {
        const exists = collections.playlists.some(
            (playlist) => playlist.id === id,
        );

        if (!exists) return;

        selectedId = id;
    }

    function closePlaylist() {
        selectedId = null;
    }
</script>


<div class="playlists-panel">

    {#if selectedPlaylist === null}
        <form class="playlist-form" onsubmit={handleCreate}>
            <input
                type="text"
                aria-label="New playlist name"
                placeholder="New playlist name"
                maxlength="80"
                required
                disabled={!collections.isReady}
                bind:value={name}
            />

            <button
                type="submit"
                disabled={!collections.isReady || !name.trim()}
            >
                Create
            </button>
        </form>
    {/if}


    {#if collections.error}
        <p class="playlist-error" role="alert">
            {collections.error}
        </p>
    {/if}

    {#if !collections.isReady}
        <p class="metadata-status" role="status">Wait a sec, loading</p>
    {:else if selectedPlaylist}
        <div class="playlist-header">
            <button
                class="playlist-back"
                type="button"
                onclick={closePlaylist}
            >
                Back
            </button>

            <div class="playlist-heading">
                <h3>{selectedPlaylist.name}</h3>
                <span class="playlist-count">
                    {selectedPlaylist.trackIds.length} tracks
                </span>
            </div>
        </div>

        <div class="queue-empty">
            <h3>Oh no, no tracks yet</h3>
        </div>
    {:else if collections.playlists.length === 0}
        <div class="queue-empty">
            <h3>Oh wow, no playlists yet?</h3>
            <p>Create your first playlist above</p>
        </div>

    {:else}
        <ul class="playlist-list" aria-label="Playlists">
            {#each collections.playlists as playlist (playlist.id)}
                <li>
                    <button
                        class="playlist-card"
                        type="button"
                        aria-label={`open ${playlist.name}`}
                        onclick={() => openPlaylist(playlist.id)}
                    >
                        <span class="playlist-name">{playlist.name}</span>
                        <span class="playlist-count">
                            {playlist.trackIds.length} tracks
                        </span>
                    </button>
                </li>
            {/each}
        </ul>
    {/if}
</div>


<style>
    .playlists-panel {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 14px;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
    }

    .playlist-form {
        display: flex;
        flex: none;
        gap: 8px;
        min-width: 0;
    }

    .playlist-form input {
        flex: 1;
        min-width: 0;
        height: 36px;
        padding: 0 10px;
        border: 1px solid var(--color-line);
        border-radius: 10px;
        color: inherit;
        background: #fff;
        font-size: 12px;
    }

    .playlist-form button {
        flex: none;
        padding: 0 12px;
        border: 1px solid var(--color-line);
        border-radius: 10px;
        color: inherit;
        background: var(--color-surface);
        font-size: 12px;
        cursor: pointer;
    }


    .playlist-form button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .playlist-error {
        margin: 0;
        color: #a83b16;
        font-size: 12px;
        line-height: 1.5;
    }

    .playlist-list {
        flex: 1;
        min-height: 0;
        margin: 0;
        padding: 2px;
        overflow-y: auto;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        list-style: none;
    }

    .playlist-card {
        display: grid;
        gap: 5px;
        margin-bottom: 8px;
        padding: 14px;
        border: 1px solid var(--color-line);
        border-radius: 12px;
        background: var(--color-surface);
        width: 100%;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
    }

    .playlist-name {
        overflow-wrap: anywhere;
        font-size: 13px;
        font-weight: 600;
    }

    .playlist-count {
        color: var(--color-muted);
        font-size: 11px;
    }

    .playlist-card:hover {
        border-color: var(--color-accent-ink);  
    }

    .playlist-header {
        display: flex;
        flex: none;
        align-items: flex-start;
        gap: 12px;
        min-width: 0;
    }

    .playlist-back {
        flex: none;
        padding: 7px 10px;
        border: 1px solid var(--color-line);
        border-radius: 8px;
        color: inherit;
        background: var(--color-surface);
        font-size: 12px;
        cursor: pointer;
    }

    .playlist-heading {
        min-width: 0;
    }

    .playlist-heading h3 {
        margin: 0 0 5px;
        overflow-wrap: anywhere;
        font-size: 16px;
        line-height: 1.3;
    }
</style>