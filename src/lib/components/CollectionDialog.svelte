<script lang="ts">
  let { open, title, message = "", initialValue = "", confirmLabel, mode = "confirm", error = "", onsubmit, onclose }: {
    open: boolean;
    title: string;
    message?: string;
    initialValue?: string;
    confirmLabel: string;
    mode?: "name" | "confirm";
    error?: string;
    onsubmit: (value: string) => boolean;
    onclose: () => void;
  } = $props();
  let dialog = $state<HTMLDialogElement>();
  let value = $state("");
  const id = $props.id();
  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      value = initialValue;
      dialog.showModal();
    } else if (!open && dialog.open) dialog.close();
  });
  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (onsubmit(value)) onclose();
  }
</script>

<dialog class="collection-dialog" bind:this={dialog} aria-labelledby={id}
  onclose={onclose} oncancel={(event) => { event.preventDefault(); onclose(); }}>
  <form onsubmit={submit}>
    <h2 id={id}>{title}</h2>
    {#if message}<p>{message}</p>{/if}
    {#if mode === "name"}
      <label>
        <span>Name</span>
        <input type="text" aria-label="Playlist name" maxlength="80" required bind:value={value} />
      </label>
    {/if}
    {#if error}<p class="dialog-error" role="alert">{error}</p>{/if}
    <div class="dialog-actions">
      <button type="button" onclick={onclose}>Cancel</button>
      <button class:destructive={mode === "confirm"} type="submit"
        disabled={mode === "name" && !value.trim()}>{confirmLabel}</button>
    </div>
  </form>
</dialog>

<style>
  .collection-dialog { width: min(390px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); padding: 24px; border: 1px solid var(--color-line); border-radius: 18px; color: var(--color-text); background: var(--color-raised); box-shadow: 0 20px 80px #0004; }
  .collection-dialog::backdrop { background: #0008; }
  form { display: grid; gap: 18px; min-width: 0; }
  h2 { margin: 0; font-size: 18px; overflow-wrap: anywhere; }
  p { margin: 0; color: var(--color-muted); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
  label { display: grid; gap: 8px; font-size: 12px; }
  input { width: 100%; min-width: 0; padding: 11px; border: 1px solid var(--color-line); border-radius: 9px; color: inherit; background: var(--color-panel); }
  .dialog-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
  button { min-height: 36px; padding: 9px 14px; border: 1px solid var(--color-line); border-radius: 9px; color: inherit; background: var(--color-panel); font-size: 12px; cursor: pointer; }
  button[type="submit"] { color: var(--color-on-accent); background: var(--color-accent); border-color: transparent; }
  button.destructive { color: var(--color-error); background: color-mix(in srgb, var(--color-error) 12%, var(--color-raised)); border-color: color-mix(in srgb, var(--color-error) 30%, transparent); }
  button:disabled { opacity: .5; cursor: not-allowed; }
  .dialog-error { color: var(--color-error); }
</style>
