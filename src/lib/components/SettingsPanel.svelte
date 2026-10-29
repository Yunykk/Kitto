<script lang="ts">
  import { accentPresets, normalizeHex, themes } from "../appearance";
  import type { AppearanceController } from "../appearance.svelte";

  type Props = {
    appearance: AppearanceController;
    open: boolean;
    onclose: () => void;
  };

  let { appearance, open, onclose }: Props = $props();
  let dialog = $state<HTMLDialogElement>();
  let hex = $state("");
  let hexError = $state("");

  $effect(() => {
    hex = appearance.accent;
    hexError = "";
  });

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });

  function submitHex(event: SubmitEvent) {
    event.preventDefault();
    const color = normalizeHex(hex);
    if (color === null) {
      hexError = "Enter a hex color, such as #397ce6.";
      return;
    }
    appearance.setAccent(color);
    hex = color;
    hexError = "";
  }

  function handleBackdrop(event: MouseEvent) {
    if (!dialog || event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom
    ) onclose();
  }
</script>

<dialog
  bind:this={dialog}
  class="settings-dialog"
  aria-labelledby="settings-heading"
  onclose={onclose}
  oncancel={(event) => { event.preventDefault(); onclose(); }}
  onclick={handleBackdrop}
>
  <header class="settings-header">
    <h2 id="settings-heading">Settings</h2>
    <button class="close-settings" type="button" aria-label="Close settings" onclick={onclose}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
        <path d="m6 6 12 12M18 6 6 18" />
      </svg>
    </button>
  </header>

  <div class="settings-content">
    <fieldset class="settings-section" disabled={!appearance.isReady}>
      <legend>Player theme</legend>
      <div class="theme-grid">
        {#each themes as theme (theme.id)}
          <button
            class="theme-card"
            class:selected={appearance.theme === theme.id}
            type="button"
            aria-pressed={appearance.theme === theme.id}
            aria-label={theme.name}
            onclick={() => appearance.setTheme(theme.id)}
          >
            <span class="theme-preview" data-preview={theme.id} aria-hidden="true">
              {#if theme.id === "orbit"}
                <span class="preview-vinyl"><span></span></span>
              {:else if theme.id === "soft-ceramic"}
                <span class="preview-ceramic"><i></i><i></i></span>
              {:else if theme.id === "editorial"}
                <span class="preview-vinyl"><span></span></span>
                <span class="preview-cover"></span>
              {:else if theme.id === "tape-deck"}
                <span class="preview-cassette"><i></i><i></i></span>
              {:else}
                <span class="preview-cover"></span>
              {/if}
            </span>
            <span class="theme-card-label">
              <span>{theme.name}</span>
              <span class="theme-selection" aria-hidden="true">
                {#if appearance.theme === theme.id}
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 8 3 3 7-7" /></svg>
                {/if}
              </span>
            </span>
          </button>
        {/each}
      </div>
    </fieldset>

    <fieldset class="settings-section" disabled={!appearance.isReady}>
      <legend>Color mode</legend>
      <div class="mode-picker">
        <button type="button" class:chosen={appearance.mode === "light"} aria-pressed={appearance.mode === "light"} onclick={() => appearance.setMode("light")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></svg>
          Light
        </button>
        <button type="button" class:chosen={appearance.mode === "dark"} aria-pressed={appearance.mode === "dark"} onclick={() => appearance.setMode("dark")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z" /></svg>
          Dark
        </button>
      </div>
    </fieldset>

    <fieldset class="settings-section" disabled={!appearance.isReady}>
      <legend>Accent color</legend>
      <div class="accent-swatches" role="group" aria-label="Accent presets">
        {#each accentPresets as preset (preset.color)}
          <button
            class="accent-swatch"
            type="button"
            style:--swatch={preset.color}
            aria-label={preset.name}
            aria-pressed={appearance.accent === preset.color}
            title={preset.name}
            onclick={() => appearance.setAccent(preset.color)}
          >
            {#if appearance.accent === preset.color}<span aria-hidden="true"></span>{/if}
          </button>
        {/each}
      </div>
      <form class="custom-accent" onsubmit={submitHex}>
        <label class="custom-color">
          <input type="color" aria-label="Choose a custom accent color" value={appearance.accent} oninput={(event) => appearance.setAccent(event.currentTarget.value)} />
          <span>Custom color</span>
        </label>
        <div class="hex-controls">
          <label class="sr-only" for="accent-hex">Accent hex code</label>
          <input id="accent-hex" class="hex-input" type="text" maxlength="7" spellcheck={false} autocomplete="off" aria-invalid={hexError ? "true" : undefined} aria-describedby={hexError ? "hex-error" : undefined} bind:value={hex} oninput={() => hexError = ""} />
          <button class="apply-accent" type="submit">Apply</button>
        </div>
      </form>
      {#if hexError}<p id="hex-error" class="settings-error" role="alert">{hexError}</p>{/if}
    </fieldset>

    {#if appearance.error}<p class="settings-error" role="alert">{appearance.error}</p>{/if}
  </div>

  <footer class="settings-footer">
    <button class="reset-appearance" type="button" disabled={!appearance.isReady} onclick={() => { appearance.reset(); hexError = ""; }}>Reset appearance</button>
    <span>Changes save automatically</span>
  </footer>
</dialog>

<style>
  .settings-dialog {
    width: min(760px, calc(100vw - 32px));
    max-width: none;
    max-height: min(900px, calc(100dvh - 32px));
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--color-line);
    border-radius: 22px;
    color: var(--color-text);
    background: var(--color-surface);
    box-shadow: 0 24px 100px #00000040;
  }
  .settings-dialog[open] { display: flex; flex-direction: column; }
  .settings-dialog::backdrop { background: #090a0c85; backdrop-filter: blur(5px); }
  .settings-header { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 16px; padding: 25px 28px 22px; border-bottom: 1px solid var(--color-line); }
  h2 { margin: 0; font-size: 27px; font-weight: 650; letter-spacing: -1px; }
  .close-settings { display: grid; flex: none; place-items: center; width: 36px; height: 36px; padding: 8px; border: 1px solid var(--color-line); border-radius: 50%; color: var(--color-muted); background: var(--color-raised); cursor: pointer; }
  .close-settings svg { width: 20px; height: 20px; }
  .close-settings:hover { color: var(--color-text); background: var(--color-hover); }
  .settings-content { flex: 1; min-height: 0; padding: 25px 28px; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
  .settings-section { min-width: 0; margin: 0; padding: 0; border: 0; }
  .settings-section + .settings-section { margin-top: 26px; padding-top: 24px; border-top: 1px solid var(--color-line); }
  legend { padding: 0; font-size: 14px; font-weight: 650; letter-spacing: -0.2px; }
  .theme-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 11px; margin-top: 16px; }
  .theme-card { min-width: 0; padding: 5px; overflow: hidden; border: 1px solid var(--color-line); border-radius: 13px; color: inherit; background: var(--color-raised); text-align: left; cursor: pointer; }
  .theme-card:hover { border-color: var(--color-muted); }
  .theme-card.selected { border-color: var(--color-accent-ink); box-shadow: 0 0 0 1px var(--color-accent-ink); }
  .theme-card-label { display: flex; align-items: center; justify-content: space-between; gap: 4px; padding: 9px 5px 5px; font-size: 11px; font-weight: 550; }
  .theme-selection { display: grid; flex: none; place-items: center; width: 15px; height: 15px; border: 1px solid var(--color-line); border-radius: 50%; }
  .selected .theme-selection { border-color: var(--color-accent); color: var(--color-on-accent); background: var(--color-accent); }
  .theme-selection svg { width: 11px; height: 11px; }
  .theme-preview { position: relative; display: grid; place-items: center; height: 98px; overflow: hidden; border-radius: 8px; background: var(--color-panel); }
  .preview-vinyl { position: relative; display: grid; place-items: center; width: 78px; aspect-ratio: 1; border: 1px solid #080a0b; border-radius: 50%; background: repeating-radial-gradient(circle, transparent 0 2px, #ffffff15 2.5px 3px, transparent 3.5px 4px), conic-gradient(from 35deg, #0b0d0f, #394047, #0c1013, #30373d, #090b0d); box-shadow: 0 3px 5px #0003; }
  .preview-vinyl > span { position: relative; width: 30%; aspect-ratio: 1; overflow: hidden; border-radius: 50%; background: radial-gradient(circle at 30% 28%, var(--accent-light), var(--color-accent) 65%, var(--accent-dark)); }
  .preview-vinyl > span::before { position: absolute; inset: 0; background: linear-gradient(145deg, transparent 48%, #111b 49% 68%, transparent 69%); content: ""; }
  .preview-vinyl > span::after { position: absolute; inset: 43%; border-radius: 50%; background: #111; content: ""; }
  .preview-cover { position: relative; width: 72px; aspect-ratio: 1; overflow: hidden; border: 1px solid color-mix(in srgb, var(--color-text) 15%, transparent); background: var(--color-raised); box-shadow: 0 3px 6px #0002; }
  .preview-cover::before { position: absolute; top: 13%; right: 15%; width: 42%; aspect-ratio: 1; border-radius: 50%; background: var(--color-accent); content: ""; }
  .preview-cover::after { position: absolute; inset: 44% -10% -20%; border-radius: 45% 65% 0 0; background: var(--color-text); transform: rotate(-12deg); content: ""; }
  .preview-ceramic { position: relative; width: 96px; height: 68px; border: 1px solid color-mix(in srgb, var(--color-raised) 75%, var(--color-muted)); border-radius: 23px; background: linear-gradient(145deg, var(--color-raised), var(--color-panel)); box-shadow: inset 2px 2px 4px #ffffff65, inset -2px -2px 5px #0002, 4px 6px 8px #0002; }
  .preview-ceramic i:first-child { position: absolute; top: 12px; left: 12px; width: 42px; height: 42px; border: 5px solid var(--color-line); border-radius: 50%; background: radial-gradient(circle at 32% 28%, var(--accent-light), var(--color-accent) 65%, var(--accent-dark)); box-shadow: inset 0 2px 4px #0003; }
  .preview-ceramic i:last-child { position: absolute; right: 12px; top: 24px; width: 20px; height: 20px; border: 2px solid var(--color-line); border-radius: 50%; background: repeating-radial-gradient(circle, var(--color-muted) 0 1px, var(--color-panel) 1px 2px); }
  [data-preview="editorial"] .preview-vinyl { position: absolute; top: 17px; left: calc(50% - 12px); width: 65px; }
  [data-preview="editorial"] .preview-cover { position: absolute; top: 13px; left: calc(50% - 48px); width: 70px; border-radius: 1px; box-shadow: 2px 0 0 var(--color-line), 0 3px 6px #0002; }
  .preview-cassette { position: relative; display: flex; align-items: center; justify-content: space-between; width: 108px; height: 58px; padding: 8px 10px; border: 6px solid var(--color-line); border-radius: 6px; background: #1c2420; box-shadow: inset 0 2px 4px #0009, 0 3px 5px #0003; }
  .preview-cassette::before { position: absolute; inset: 11px 20px; border-top: 1px solid #7a817b; border-bottom: 1px solid #7a817b; content: ""; }
  .preview-cassette i { position: relative; width: 27px; height: 27px; border: 5px solid var(--color-accent); border-radius: 50%; background: conic-gradient(#28312b, #c7cdc7, #29332c, #c7cdc7, #28312b); box-shadow: 0 0 0 2px #111; }
  [data-preview="floating-bento"] .preview-cover { border-radius: 8px; }
  [data-preview="paper-club"] .preview-cover { width: 76px; border: 5px solid color-mix(in srgb, var(--color-raised) 94%, var(--color-accent)); border-radius: 0; }
  .mode-picker { display: flex; gap: 9px; margin-top: 16px; }
  .mode-picker button { display: flex; align-items: center; justify-content: center; gap: 9px; min-width: 110px; padding: 11px 18px; border: 1px solid var(--color-line); border-radius: 11px; color: var(--color-muted); background: var(--color-raised); font-size: 12px; cursor: pointer; }
  .mode-picker svg { width: 17px; height: 17px; }
  .mode-picker button.chosen { border-color: var(--color-accent-ink); color: var(--color-accent-ink); background: var(--color-accent-soft); }
  .accent-swatches { display: flex; flex-wrap: wrap; gap: 11px; margin-top: 16px; margin-bottom: 17px; }
  .accent-swatch { display: grid; place-items: center; width: 31px; height: 31px; padding: 0; border: 3px solid var(--color-surface); border-radius: 50%; outline: 1px solid transparent; background: var(--swatch); cursor: pointer; }
  .accent-swatch[aria-pressed="true"] { outline-color: var(--color-accent-ink); }
  .accent-swatch:focus-visible { outline: 2px solid var(--color-accent-ink); outline-offset: 3px; }
  .accent-swatch span { width: 7px; height: 7px; border: 2px solid #fff; border-radius: 50%; box-shadow: 0 0 0 1px #00000022; }
  .custom-accent { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .custom-color { display: flex; align-items: center; gap: 10px; color: var(--color-muted); font-size: 12px; cursor: pointer; }
  .custom-color input { width: 34px; height: 34px; padding: 3px; border: 1px solid var(--color-line); border-radius: 8px; background: var(--color-raised); cursor: pointer; }
  .hex-controls { display: flex; gap: 7px; }
  .hex-input { width: 95px; min-width: 0; padding: 8px 10px; border: 1px solid var(--color-line); border-radius: 9px; color: var(--color-text); background: var(--color-raised); font-family: ui-monospace, monospace; font-size: 12px; }
  .hex-input[aria-invalid="true"] { border-color: var(--color-error); }
  .apply-accent { padding: 8px 12px; border: 1px solid var(--color-line); border-radius: 9px; color: var(--color-text); background: var(--color-raised); font-size: 12px; cursor: pointer; }
  .apply-accent:hover { background: var(--color-hover); }
  .settings-error { margin: 12px 0 0; color: var(--color-error); font-size: 12px; line-height: 1.5; }
  .settings-footer { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 28px; border-top: 1px solid var(--color-line); }
  .settings-footer > span { color: var(--color-muted); font-size: 10px; text-align: right; }
  .reset-appearance { padding: 0; border: 0; color: var(--color-muted); background: transparent; font-size: 11px; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .reset-appearance:hover { color: var(--color-text); }
  @media (max-width: 520px) {
    .settings-dialog { width: calc(100vw - 20px); max-height: calc(100dvh - 20px); border-radius: 17px; }
    .settings-header { padding: 19px 18px; }
    .settings-content { padding: 21px 18px; }
    .settings-footer { padding: 15px 18px; }
    .theme-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .theme-preview { height: 92px; }
    .custom-accent { align-items: stretch; flex-direction: column; gap: 12px; }
    .hex-input { flex: 1; width: auto; }
  }
</style>
