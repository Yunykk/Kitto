<script lang="ts">
  import type { QueueTrack } from "../types";

  type Props = {
    tracks: QueueTrack[];
    currentIndex: number;
    onselect: (index: number) => void;
    onremove: (id: string) => void;
    onclear: () => void;
  };

  let {
    tracks,
    currentIndex,
    onselect,
    onremove,
    onclear,
  }: Props = $props();

  let query = $state("");

  let visibleTracks = $derived.by(() => {
    const term = query.trim().toLowerCase();

    return tracks
      .map((track, index) => ({ track, index }))
      .filter(({ track }) => track.title.toLowerCase().includes(term));
  });

  $effect(() => {
    if (tracks.length === 0) {
      query = "";
    }
  });
</script>

{#if tracks.length > 0}
  <section class="library-panel" aria-labelledby="queue-heading">
    <div class="library-toolbar">
      <h3 id="queue-heading">Queue</h3>

      <span class="queue-count">
        {visibleTracks.length} / {tracks.length}
      </span>

      <button
        class="library-clear"
        type="button"
        onclick={onclear}
      >
        Clear queue
      </button>
    </div>

    <input
      class="library-search"
      type="search"
      placeholder="Search tracks"
      aria-label="Search tracks"
      spellcheck={false}
      bind:value={query}
    />

    {#if visibleTracks.length === 0}
      <p class="queue-empty" role="status">No matching tracks.</p>
    {:else}
      <ol class="track-list" aria-label="Playback queue">
        {#each visibleTracks as { track, index } (track.id)}
          <li>
            <button
              class="track-select"
              class:active={index === currentIndex}
              type="button"
              aria-current={index === currentIndex ? "true" : undefined}
              title={track.title}
              onclick={() => onselect(index)}
            >
              {index + 1}. {track.title}
            </button>

            <button
              class="track-remove"
              type="button"
              aria-label={`Remove ${track.title} from queue`}
              onclick={() => onremove(track.id)}
            >
              Remove
            </button>
          </li>
        {/each}
      </ol>
    {/if}
  </section>
{/if}