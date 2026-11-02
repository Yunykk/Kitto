<script lang="ts">
  import PopoverButton from "./PopoverButton.svelte";
  import { views, sortNames, type CollectionView, type CollectionSort } from "../collection";
  let { query, placeholder, view, sort, sorts, onquery, onview, onsort }: {
    query: string;
    placeholder: string;
    view: CollectionView;
    sort: CollectionSort;
    sorts: CollectionSort[];
    onquery: (value: string) => void;
    onview: (value: CollectionView) => void;
    onsort: (value: CollectionSort) => void;
  } = $props();
</script>

<div class="collection-toolbar">
  <label class="library-search">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" />
    </svg>
    <input type="search" {placeholder} aria-label={placeholder} spellcheck={false}
      value={query} oninput={(event) => onquery(event.currentTarget.value)} />
  </label>
  <PopoverButton label="Sort and view" icon="view">
    {#snippet children(close)}
      <p class="menu-label">Sort by</p>
      {#each sorts as option}
        <button class="menu-action" type="button" aria-pressed={sort === option}
          onclick={() => { onsort(option); close(); }}>
          {sortNames[option]}
          {#if sort === option}<span aria-hidden="true">✓</span>{/if}
        </button>
      {/each}
      <div class="view-section">
        <p class="menu-label">View</p>
        <div class="view-options" role="group" aria-label="Collection view">
          {#each views as option}
            <button type="button" aria-label={option.name} title={option.name}
              aria-pressed={view === option.id} onclick={() => { onview(option.id); close(); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">
                <path d={option.path} />
              </svg>
            </button>
          {/each}
        </div>
      </div>
    {/snippet}
  </PopoverButton>
</div>

<style>
  .collection-toolbar { display: flex; flex: none; align-items: center; gap: 8px; min-width: 0; }
  .view-section { margin-top: 8px; padding-top: 12px; border-top: 1px solid var(--color-line); }
  .view-options { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; padding: 4px; border-radius: 10px; background: var(--color-panel); }
  .view-options button { display: grid; place-items: center; min-height: 40px; border: 0; border-radius: 8px; color: var(--color-muted); background: transparent; cursor: pointer; }
  .view-options button:hover { background-color: var(--color-hover); }
  .view-options button[aria-pressed="true"] { color: var(--color-accent-ink); background-color: var(--color-accent-soft); }
  .view-options svg { width: 21px; height: 21px; }
</style>
