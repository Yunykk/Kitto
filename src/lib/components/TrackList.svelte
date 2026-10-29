<script lang="ts">
  import type { DisplayTrack } from "../types";
  import AddMusicButton from "./AddMusicButton.svelte";
  import PlaylistsPanel from "./PlaylistsPanel.svelte";

  type Props = {
    tracks: DisplayTrack[];
    isIndexing: boolean;
    metadataError: string;
    currentIndex: number;
    isChoosingFiles: boolean;
    onadd: () => void;
    onselect: (index: number) => void;
    onremove: (id: string) => void;
    onclear: () => void;
  };

  let {
    tracks,
    currentIndex,
    isChoosingFiles,
    isIndexing,
    metadataError,
    onadd,
    onselect,
    onremove,
    onclear,
  } : Props = $props();

  let query = $state("");

  let section = $state<"tracks" | "playlists">("tracks")

  let visibleTracks = $derived.by(() => {
    const term = query.trim().toLowerCase();



    return tracks
      .map((track, index) => ({ track, index }))
      .filter(({ track }) => {
        const searchable = [
          track.title,
          track.artist,
          track.album,
          track.fileName,
        ]

        .filter(Boolean)
        .join(" ")
        .toLowerCase();

        return searchable.includes(term);
      });
  });

  $effect(() => {
    if (tracks.length === 0) query = "";
  });
</script>

<aside class="library-panel" aria-labelledby="queue-heading">
  <div class="library-heading">
    <h2 id="queue-heading">
      Library
      {#if section === "tracks"}
        <span class="queue-count">
          {query.trim()
            ? `${visibleTracks.length} / ${tracks.length}` 
            : tracks.length}
        </span>
      {/if}
    </h2>
    <AddMusicButton {isChoosingFiles} {onadd} />
  </div>

  <div class="library-tabs" role="group" aria-label="Library sections">
    <button
      type="button"
      aria-pressed={section === "tracks"}
      onclick={() => section = "tracks"}
    >
      Music
    </button>

    <button
      type="button"
      aria-pressed={section === "playlists"}
      onclick={() => section = "playlists"}
    >
      Playlists
    </button>
  </div>

  {#if section === "playlists"}
    <PlaylistsPanel />
  {:else}

  <div class="library-tools">
    <label class="library-search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4" />
      </svg>
      <input type="search" placeholder="Search tracks" aria-label="Search tracks" spellcheck={false} bind:value={query} />
    </label>
    <button class="library-clear" type="button" aria-label="Clear queue" disabled={tracks.length === 0} onclick={onclear}>
      Clear
    </button>
  </div>

  {#if isIndexing || metadataError}
    <p class="metadata-status" role="status">
      {isIndexing ? "Reading track details..." : metadataError}
    </p>
  {/if}

  {#if tracks.length === 0}
    <div class="queue-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 18V5l12-2v13M9 8l12-2" />
        <ellipse cx="6" cy="18" rx="3" ry="3" />
        <ellipse cx="18" cy="16" rx="3" ry="3" />
      </svg>
      <h3>Your queue is empty</h3>
      <p>Add a few tracks to get started.</p>
    </div>
  {:else if visibleTracks.length === 0}
    <div class="queue-empty" role="status">
      <h3>No matching tracks</h3>
      <p>Try a different name.</p>
    </div>
  {:else}
    <ol class="track-list" aria-label="Playback queue">
      {#each visibleTracks as { track, index } (track.id)}
        <li class:active={index === currentIndex}>
          <button
            class="track-select"
            class:active={index === currentIndex}
            type="button"
            aria-current={index === currentIndex ? "true" : undefined}
            title={track.title}
            onclick={() => onselect(index)}
          >
            <span class="track-index">{String(index + 1).padStart(2, "0")}</span>
            <span class="track-label">
              <span class="track-name">{track.title}</span>

              {#if track.artist}
                <span class="track-artist">{track.artist}</span>
              {/if}
            </span>
          </button>
          <button class="track-remove" type="button" aria-label={`Remove ${track.title} from queue`} title="Remove from queue" onclick={() => onremove(track.id)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
              <path d="m7 7 10 10M17 7 7 17" />
            </svg>
          </button>
        </li>
      {/each}
    </ol>
  {/if}
  {/if}
</aside>



<style>
  .library-tabs {
    display: flex;
    flex: none;
    gap: 4px;
    margin-bottom: 14px;
    padding: 4px;
    border-radius: 12px;
    background: #eeece6;
  }

  .library-tabs button {
    flex: 1;
    min-width: 0;
    padding: 8px;
    border: 0;
    border-radius: 9px;
    color: var(--color-muted);
    background: transparent;
    font-size: 12px;
    cursor: pointer;
  }

  .library-tabs button[aria-pressed="true"] {
    color: #191918;
    background: var(--color-surface);
    box-shadow: 0 1px 4px #2b211412;
  }
</style>