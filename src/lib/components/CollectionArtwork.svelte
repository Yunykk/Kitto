<script lang="ts">
  import LibraryCover from "./LibraryCover.svelte";
  import CoverArtwork from "./CoverArtwork.svelte";
  let { paths }: { paths: string[] } = $props();
  const covers = $derived(paths.slice(0, 4));
</script>
<div class="collection-artwork" class:collage={covers.length > 1} aria-hidden="true">
  {#if covers.length === 0}
    <CoverArtwork coverUrl={null} coverStatus="missing" />
  {:else if covers.length === 1}
    <LibraryCover path={covers[0]} />
  {:else}
    {#each [0, 1, 2, 3] as index}
      <LibraryCover path={covers[index % covers.length]} />
    {/each}
  {/if}
</div>
<style>
  .collection-artwork { display: grid; width: 100%; height: 100%; overflow: hidden; background: var(--color-panel); }
  .collage { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 1px; }
</style>
