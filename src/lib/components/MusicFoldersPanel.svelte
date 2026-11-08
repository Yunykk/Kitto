<script lang="ts">
  import type { MusicFoldersController } from "../music-folders.svelte";

  let {
    controller,
  }: {
    controller: MusicFoldersController;
  } = $props();

  function scanDate(value: number | null): string {
    return value === null
      ? "Not scanned yet"
      : `Last scan: ${new Date(value).toLocaleString()}`;
  }
</script>

<fieldset
  class="folders-panel"
  disabled={!controller.isReady || !controller.canWrite}
>
  <legend>Music folders</legend>

  <div class="folders-toolbar">
    <p>Removing a folder keeps its imported tracks.</p>

    <button
      type="button"
      disabled={controller.isBusy}
      onclick={() => void controller.add()}
    >
      {controller.isChoosing ? "Opening…" : "Add folder"}
    </button>
  </div>

  {#if controller.folders.length === 0 && controller.isReady}
    <p class="folders-empty">No music folders added.</p>
  {/if}

  <ul class="folder-list">
    {#each controller.folders as folder (folder.id)}
      <li class="folder-row">
        <div class="folder-info">
          <strong>{folder.name}</strong>

          <span class="folder-location" title={folder.location}>
            {folder.location}
          </span>

          <span>
            {folder.trackIds.length}
            {folder.trackIds.length === 1 ? "track" : "tracks"}
            · {scanDate(folder.lastScannedAt)}
          </span>
        </div>

        <div class="folder-actions">
          <button
            type="button"
            aria-label={`Rescan ${folder.name}`}
            disabled={controller.isBusy}
            onclick={() => void controller.scan(folder.id)}
          >
            Rescan
          </button>

          <button
            type="button"
            aria-label={`Remove ${folder.name} from music folders`}
            disabled={controller.isBusy}
            onclick={() => controller.remove(folder.id)}
          >
            Remove
          </button>
        </div>
      </li>
    {/each}
  </ul>

  {#if controller.scanningId !== null}
    <div class="scan-progress">
      <p role="status">
        Scanning… {controller.filesFound} files found
      </p>

      <button
        type="button"
        onclick={controller.cancelScan}
      >
        Cancel
      </button>
    </div>
  {/if}

  {#if controller.warning}
    <p class="folder-warning" role="status">
      {controller.warning}
    </p>
  {/if}

  {#if controller.error}
    <p class="folder-error" role="alert">
      {controller.error}
    </p>
  {/if}
</fieldset>

<style>
  .folders-panel {
    min-width: 0;
    margin: 0;
    padding: 16px;
    border: 1px solid var(--color-line);
    border-radius: 14px;
  }

  legend {
    padding: 0 6px;
    font-size: 14px;
    font-weight: 600;
  }

  .folders-toolbar,
  .scan-progress {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  p {
    margin: 0;
    color: var(--color-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  button {
    flex: none;
    min-height: 40px;
    padding: 8px 12px;
    border: 1px solid var(--color-line);
    border-radius: 9px;
    color: var(--color-text);
    background: var(--color-raised);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: background 160ms ease, border-color 160ms ease;
  }

  button:enabled:hover {
    border-color: var(--color-accent-ink);
    background: var(--color-accent-soft);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  button:focus-visible {
    outline: 2px solid var(--color-accent-ink);
    outline-offset: 3px;
  }

  .folder-list {
    display: grid;
    gap: 10px;
    margin: 14px 0 0;
    padding: 0;
    list-style: none;
  }

  .folder-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--color-line);
    border-radius: 10px;
    background: var(--color-surface);
  }

  .folder-info {
    display: grid;
    flex: 1;
    gap: 5px;
    min-width: 0;
  }

  .folder-info strong {
    overflow-wrap: anywhere;
    font-size: 13px;
  }

  .folder-info span {
    color: var(--color-muted);
    font-size: 11px;
    overflow-wrap: anywhere;
  }

  .folder-location {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .folder-actions {
    display: flex;
    gap: 6px;
  }

  .folders-empty,
  .scan-progress,
  .folder-warning,
  .folder-error {
    margin-top: 14px;
  }

  .folder-error {
    color: var(--color-error);
  }

  @media (max-width: 540px) {
    .folder-row {
      align-items: stretch;
      flex-direction: column;
    }

    .folder-actions {
      justify-content: flex-end;
    }

    button {
      min-height: 44px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
</style>