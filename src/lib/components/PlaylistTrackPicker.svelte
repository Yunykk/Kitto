<script lang="ts">
    import type { DisplayTrack } from "../types";

    type Props = {
        tracks: DisplayTrack[];
        existingIds: string[];
        onadd: (ids: string[]) => void;
        oncancel: () => void;
    };

    let {
        tracks,
        existingIds,
        onadd,
        oncancel,
    }: Props = $props();

    let query = $state("");
    let selectedIds = $state<string[]>([]);

    const existing = $derived(new Set(existingIds));

    const visibleTracks = $derived.by(() => {
        const term = query.trim().toLowerCase();

        return tracks.filter((track) => {
            const text = [
                track.title,
                track.artist,
                track.album,
                track.fileName,
            ]

                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return text.includes(term);
        });
    });

    const selectedTracks = $derived(
        tracks.filter(
            (track) => 
                selectedIds.includes(track.id) &&
                !existing.has(track.id),
        ),
    );

    function submit(event: SubmitEvent) {
        event.preventDefault();
        
        if (selectedTracks.length === 0) return;

        onadd(selectedTracks.map((track) => track.id));
    }

    function toggle(id: string, checked: boolean) {
        selectedIds = checked
            ? [...new Set([...selectedIds, id])]
            : selectedIds.filter((selected) => selected !== id);
    }
</script>


<form class="picker" aria-label="Add tracks from library" onsubmit={submit}>
    <input
        class="picker-search"
        type="search"
        placeholder="Search your library"
        aria-label="Search your library"
        spellcheck={false}
        bind:value={query}
    />

    {#if tracks.length === 0}
        <div class="queue-empty">
            <h3>Your library is empty</h3>
            <p>Add music to your library first.</p>
        </div>

    {:else if visibleTracks.length === 0}
        <div class="queue-empty" role="status">
            <h3>No matching tracks</h3>
            <p>Try a different name.</p>
        </div>
    {:else}
        <ul class="track-list" aria-label="Library tracks">
            {#each visibleTracks as track (track.id)}
                <li>
                    <label class="picker-row">
                        <input
                            type="checkbox"
                            value={track.id}
                            checked={selectedIds.includes(track.id)}
                            onchange={(event) => toggle(track.id, event.currentTarget.checked)}
                            disabled={existing.has(track.id)}
                        />

                        <span class="track-label">
                            <span class="track-name" title={track.title}>
                                {track.title}
                            </span>
                            {#if track.artist}
                                <span class="track-artist">{track.artist}</span>
                            {/if}
                        </span>

                        {#if existing.has(track.id)}
                            <span class="added-label">Added</span>
                        {/if}
                    </label>
                </li>
            {/each}
        </ul>
    {/if}

    <div class="picker-actions">
        <button type="button" onclick={oncancel}>
            Cancel
        </button>

        <button type="submit" disabled={selectedTracks.length === 0}>
            Add selected ({selectedTracks.length})
        </button>
    </div>
</form>


<style>
    .picker {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 12px;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
    } 

    .picker-search {
        flex: none;
        width: 100%;
        min-width: 0;
        height: 36px;
        padding: 0 10px;
        border: 1px solid var(--color-line);
        border-radius: 10px;
        color: var(--color-text);
        background: var(--color-raised);
        font-size: 12px;
    }

    .picker-row {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        min-width: 0;
        min-height: 48px;
        padding: 10px;
        cursor: pointer;
    }

    .picker-row:has(input:disabled) {
        cursor: default;
    }

    .picker-row input {
        flex: none;
        margin: 0;
        accent-color: var(--color-accent);
    }

    .added-label {
        flex: none;
        color: var(--color-muted);
        font-size: 11px;
    }

    .picker-actions {
        display: flex;
        flex: none;
        flex-wrap: wrap;
        gap: 8px;
    }

    .picker-actions button{
        min-height: 36px;
        padding: 8px 12px;
        border: 1px solid var(--color-line);
        border-radius: 10px;
        color: var(--color-text);
        background: var(--color-raised);
        font-size: 12px;
        cursor: pointer;
    }

    .picker-actions button:enabled:hover {
        border-color: var(--color-accent-ink);
        background: var(--color-accent-soft);
    }

    .picker-actions button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
</style>
