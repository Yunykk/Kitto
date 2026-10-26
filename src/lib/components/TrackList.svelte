<script lang="ts">
  import type { QueueTrack } from "../types";
  import AddMusicButton from "./AddMusicButton.svelte";

  type Props = {
    tracks: QueueTrack[];
    currentIndex: number;
    isChoosingFiles: boolean;
    onadd: () => void;
    onselect: (index: number) => void;
    onremove: (id: string) => void;
    onclear: () => void;
  };

  let { tracks, currentIndex, isChoosingFiles, onadd, onselect, onremove, onclear }: Props = $props();
  let query = $state("");

  let visibleTracks = $derived.by(() => {
    const term = query.trim().toLowerCase();
    return tracks
      .map((track, index) => ({ track, index }))
      .filter(({ track }) => track.title.toLowerCase().includes(term));
  });

  $effect(() => {
    if (tracks.length === 0) query = "";
  });
</script>

<aside class="library-panel" aria-labelledby="queue-heading">
  <div class="library-heading">
    <h2 id="queue-heading">
      Queue
      <span class="queue-count">{query.trim() ? `${visibleTracks.length} / ${tracks.length}` : tracks.length}</span>
    </h2>
    <AddMusicButton {isChoosingFiles} {onadd} />
  </div>

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
            <span class="track-name">{track.title}</span>
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
</aside>
