<script lang="ts">
  import type { Snippet } from "svelte";
  import type { CollectionItem, CollectionView } from "../collection";
  import type { FavoritesController } from "../favorites.svelte";
  import CollectionArtwork from "./CollectionArtwork.svelte";
  import FavoritesButton from "./FavoritesButton.svelte";


  let {
    items,
    view,
    label,
    activeId = null,
    isPlaying = false,
    action = "Play",
    onopen,
    actions,
    favorites,
  }: {
    items: CollectionItem[];
    view: CollectionView;
    label: string;
    activeId?: string | null;
    isPlaying?: boolean;
    action?: string;
    onopen: (id: string) => void;
    actions?: Snippet<[CollectionItem]>;
    favorites?: FavoritesController;
  } = $props();

  const actionSpace = $derived(
    (favorites ? 34 : 0) +
    (actions ? 28 : 2) +
    (favorites && actions ? 4 : 0) +
    12,
  );
</script>

<ul
  class="collection-list"
  class:tiles={view === "grid" || view === "covers"}
  data-view={view}
  aria-label={label}
  style:--action-space={`${actionSpace}px`}
>
  {#each items as item, index (item.id)}

    {#if item.group && (
      index === 0 || item.group !== items[index - 1]?.group
    )}
      <li class="collection-group">
        <h4>{item.group}</h4>
      </li>
    {/if}
    <li
      class:active={item.id === activeId}
      class:liked={favorites?.has(item.id) ?? false}
    >
      <button
        class="collection-open"
        type="button"
        title={item.title}
        aria-label={`${action} ${item.title}`}
        aria-current={item.id === activeId ? "true" : undefined}
        onclick={() => onopen(item.id)}
      >

        {#if item.trackNumber !== undefined}
          <span class="collection-number" aria-hidden="true">
            {item.trackNumber ?? "—"}
          </span>
        {/if}
        {#if view !== "compact"}
          <span class="collection-image">
            <CollectionArtwork paths={item.paths} />
          </span>
        {/if}

        <span class="collection-caption">
          <span class="collection-title">{item.title}</span>

          {#if item.subtitle}
            <span class="collection-subtitle">
              {item.subtitle}
            </span>
          {/if}
        </span>


        {#if item.id === activeId}
          <span
            class="playing-indicator"
            aria-label={isPlaying ? "Playing" : "Paused"}
          >
            {isPlaying ? "▶" : "Ⅱ"}
          </span>
        {/if}
      </button>


      {#if favorites || actions}
        <div class="collection-actions">
          {#if favorites}
            <span class="collection-favorite">
              <FavoritesButton
                liked={favorites.has(item.id)}
                disabled={!favorites.isReady}
                ontoggle={() => favorites?.toggle(item.id)}
              />
            </span>
          {/if}

          {#if actions}
            <span class="collection-menu">
              {@render actions(item)}
            </span>
          {/if}
        </div>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .collection-list {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    min-height: 0;
    margin: 0;
    padding: 2px 3px 4px 1px;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-gutter: stable;
    scrollbar-color: var(--color-line) transparent;
    list-style: none;
  }

  li {
    position: relative;
    flex: none;
    min-width: 0;
    border: 1px solid transparent;
    border-radius: 10px;
    transition:
      background-color var(--motion-hover, 140ms),
      border-color var(--motion-hover, 140ms);
  }

  li:hover {
    background-color: var(--color-hover);
  }

  li.active {
    border-color: color-mix(
      in srgb,
      var(--color-accent) 35%,
      transparent
    );
    background-color: var(--color-accent-soft);
  }

  .collection-open {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-width: 0;
    min-height: 60px;
    padding: 7px var(--action-space, 12px) 7px 7px;
    border: 0;
    border-radius: inherit;
    color: var(--color-text);
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .collection-image {
    display: block;
    flex: none;
    width: 44px;
    height: 44px;
    overflow: hidden;
    border: 1px solid var(--color-line);
    border-radius: 7px;
  }

  .collection-caption {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .collection-title,
  .collection-subtitle {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .collection-title {
    font-size: 12px;
    font-weight: 550;
  }

  .collection-subtitle {
    color: var(--color-muted);
    font-size: 10px;
  }

  .collection-actions {
    position: absolute;
    top: 50%;
    right: 6px;
    display: flex;
    align-items: center;
    gap: 4px;
    transform: translateY(-50%);
    pointer-events: none;
  }

  .collection-favorite,
  .collection-menu {
    display: grid;
    flex: none;
    place-items: center;
    pointer-events: auto;
  }

  .collection-menu :global(.popover-trigger) {
    width: 28px;
    height: 28px;
    padding: 5px;
    border-color: transparent;
    background: transparent;
  }

  .playing-indicator {
    flex: none;
    color: var(--color-accent-ink);
    font-size: 10px;
  }

  [data-view="compact"] .collection-open {
    min-height: 38px;
    padding-block: 8px;
  }

  [data-view="compact"] .collection-caption {
    flex-direction: row;
    align-items: baseline;
    gap: 7px;
  }

  [data-view="compact"] .collection-title {
    flex: 1;
  }

  [data-view="compact"] .collection-subtitle {
    flex: none;
    max-width: 42%;
  }

  [data-view="compact"] .collection-subtitle::before {
    content: "· ";
  }

  .tiles {
    display: grid;
    grid-template-columns:
      repeat(auto-fill, minmax(min(110px, 100%), 1fr));
    align-content: start;
    gap: 10px;
  }

  .tiles .collection-open {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    padding: 5px;
  }

  .tiles .collection-image {
    width: 100%;
    height: auto;
    aspect-ratio: 1;
    border-radius: 8px;
  }

  .tiles .collection-caption {
    min-height: 32px;
    padding: 0 2px 4px;
  }

  .tiles .collection-actions {
    top: 9px;
    right: 9px;
    transform: none;
  }

  .tiles .collection-favorite,
  .tiles .collection-menu {
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--motion-hover, 140ms);
    border: 1px solid var(--color-line);
    background: var(--color-raised);
    box-shadow: var(--shadow-soft);
  }

  .tiles .collection-favorite {
    border-radius: 50%;
  }

  .tiles .collection-menu {
    border-radius: 8px;
  }

  .tiles li:hover .collection-favorite,
  .tiles li:hover .collection-menu,
  .tiles li:focus-within .collection-favorite,
  .tiles li:focus-within .collection-menu,
  .tiles li.liked .collection-favorite {
    opacity: 1;
    pointer-events: auto;
  }

  [data-view="covers"] .collection-caption {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  .tiles .playing-indicator {
    position: absolute;
    right: 10px;
    bottom: 9px;
    padding: 3px 5px;
    border-radius: 5px;
    background: var(--color-raised);
  }

  [data-view="grid"] .playing-indicator {
    bottom: 45px;
  }


  .collection-number {
    flex: none;
    min-width: 2ch;
    color: var(--color-muted);
    text-align: center;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .collection-list > .collection-group {
    grid-column: 1 / -1;
    padding: 12px 7px 4px;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .collection-group h4 {
    margin: 0;
    color: var(--color-muted);
    font-size: 11px;
    font-weight: 600;
  }

  @media (hover: none) {
    .tiles .collection-favorite,
    .tiles .collection-menu {
      opacity: 1;
      pointer-events: auto;
    }
  }
</style>
