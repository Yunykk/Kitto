<script lang="ts">
  import type { Snippet } from "svelte";
  let { label, disabled = false, icon = "more", children }: {
    label: string;
    disabled?: boolean;
    icon?: "more" | "view";
    children: Snippet<[() => void]>;
  } = $props();
  const id = $props.id();
  let trigger: HTMLButtonElement;
  let panel: HTMLDivElement;
  let expanded = $state(false);
  function close() { panel?.hidePopover(); }
  $effect(() => {
    if (!expanded) return;
    const listener = new AbortController();
    window.addEventListener("resize", close, { signal: listener.signal });
    window.addEventListener("scroll", (event) => {
      if (!(event.target instanceof Node) || !panel.contains(event.target)) close();
    }, { capture: true, signal: listener.signal });
    return () => listener.abort();
  });
  function position(event: ToggleEvent) {
    expanded = event.newState === "open";
    if (event.newState !== "open") return;
    const bounds = trigger.getBoundingClientRect();
    const width = Math.min(264, window.innerWidth - 24);
    panel.style.width = `${width}px`;
    panel.style.left = `${Math.max(12, Math.min(bounds.right - width, window.innerWidth - width - 12))}px`;
    const below = window.innerHeight - bounds.bottom - 12;
    const above = bounds.top - 12;
    if (below >= Math.min(340, above)) {
      panel.style.top = `${bounds.bottom + 6}px`;
      panel.style.bottom = "auto";
      panel.style.maxHeight = `${Math.max(80, below - 6)}px`;
    } else {
      panel.style.top = "auto";
      panel.style.bottom = `${window.innerHeight - bounds.top + 6}px`;
      panel.style.maxHeight = `${Math.max(80, above - 6)}px`;
    }
  }
</script>

<button class="popover-trigger" type="button" aria-label={label} title={label}
  {disabled} popovertarget={id} bind:this={trigger}>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
    {#if icon === "view"}
      <path d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v5H4zM14 15h6v5h-6z" />
    {:else}
      <circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />
    {/if}
  </svg>
</button>
<div class="popover-panel" id={id} popover="auto" bind:this={panel} onbeforetoggle={position}>
  {#if expanded}{@render children(close)}{/if}
</div>

<style>
  .popover-trigger { display: grid; place-items: center; flex: none; width: 34px; height: 34px; padding: 7px; border: 1px solid var(--color-line); border-radius: 9px; color: var(--color-muted); background: var(--color-raised); cursor: pointer; }
  .popover-trigger:hover { color: var(--color-text); border-color: var(--color-accent-ink); background-color: var(--color-hover); }
  svg { width: 18px; height: 18px; }
  .popover-panel { position: fixed; inset: auto; margin: 0; padding: 8px; overflow-y: auto; border: 1px solid var(--color-line); border-radius: 14px; color: var(--color-text); background: var(--color-raised); box-shadow: 0 12px 36px #0003; }
  .popover-panel:popover-open { animation: reveal 140ms var(--motion-ease, ease-out); }
  .popover-panel :global(.menu-label) { margin: 4px 8px 8px; color: var(--color-muted); font-size: 11px; font-weight: 600; }
  .popover-panel :global(.menu-action) { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; min-height: 38px; padding: 9px 10px; border: 0; border-radius: 8px; color: inherit; background: transparent; text-align: left; font-size: 12px; cursor: pointer; }
  .popover-panel :global(.menu-action:hover) { background-color: var(--color-hover); }
  .popover-panel :global(.menu-action[aria-pressed="true"]) { color: var(--color-accent-ink); background-color: var(--color-accent-soft); }
  .popover-panel :global(.menu-action.danger) { color: var(--color-error); }
  .popover-panel :global(.menu-action:disabled) { opacity: .4; cursor: not-allowed; }
  @keyframes reveal { from { opacity: 0; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .popover-panel:popover-open { animation: none; } }
</style>
