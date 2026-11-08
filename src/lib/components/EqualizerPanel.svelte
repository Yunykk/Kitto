<script lang="ts">
  import { equalizerBands, equalizerPresets } from "../equalizer";
  import type { EqualizerController } from "../equalizer.svelte";

  let { equalizer, open, onclose, notice = "" }: {
    equalizer: EqualizerController;
    open: boolean;
    onclose: () => void;
    notice?: string;
  } = $props();

  let dialog = $state<HTMLDialogElement>();
  const id = $props.id();
  const db = (value: number) => `${value > 0 ? "+" : ""}${value} dB`;

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  function close() {
    equalizer.flush();
    onclose();
  }

  function backdrop(event: MouseEvent) {
    if (!dialog || event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  }
</script>

<dialog bind:this={dialog} class="equalizer-dialog" aria-labelledby={`${id}-heading`}
  onclose={close} oncancel={(event) => { event.preventDefault(); close(); }} onclick={backdrop}>
  <header>
    <h2 id={`${id}-heading`}>Equalizer</h2>
    <button class="close-button" type="button" aria-label="Close equalizer" onclick={close}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
        <path d="m6 6 12 12M18 6 6 18" />
      </svg>
    </button>
  </header>

  <fieldset disabled={!equalizer.isReady}>
    <legend class="sr-only">Equalizer settings</legend>
    <div class="eq-toolbar">
      <label class="toggle">
        <input type="checkbox" checked={equalizer.settings.enabled}
          onchange={(event) => equalizer.setEnabled(event.currentTarget.checked)} />
        Enabled
      </label>
      <label class="preset">
        <span class="sr-only">Preset</span>
        <select aria-label="Equalizer preset" value={equalizer.preset}
          onchange={(event) => equalizer.usePreset(event.currentTarget.value)}>
          {#if equalizer.preset === "custom"}<option value="custom" disabled>Custom</option>{/if}
          {#each equalizerPresets as preset (preset.id)}
            <option value={preset.id}>{preset.name}</option>
          {/each}
        </select>
      </label>
      <button type="button" onclick={equalizer.reset}>Reset</button>
    </div>

    <div class="bands" class:bypassed={!equalizer.settings.enabled}>
      {#each equalizerBands as band, index (band.frequency)}
        <label class="band">
          <output for={`${id}-band-${index}`}>{db(equalizer.settings.gains[index])}</output>
          <input id={`${id}-band-${index}`} class="band-slider" type="range"
            aria-label={`${band.label} Hz`} aria-valuetext={db(equalizer.settings.gains[index])}
            min="-12" max="12" step="0.5" value={equalizer.settings.gains[index]}
            style:--band-fill={`${(equalizer.settings.gains[index] + 12) / 24 * 100}%`}
            oninput={(event) => equalizer.setBand(index, event.currentTarget.valueAsNumber)}
            onchange={equalizer.flush}
            ondblclick={() => equalizer.setBand(index, 0)} />
          <span>{band.label}<small>Hz</small></span>
        </label>
      {/each}
    </div>

    <div class="preamp">
      <label for={`${id}-preamp`}>Preamp</label>
      <output for={`${id}-preamp`}>{equalizer.settings.autoPreamp ? "Auto" : db(equalizer.settings.preamp)}</output>
      <input id={`${id}-preamp`} type="range" min="-24" max="0" step="0.5"
        disabled={equalizer.settings.autoPreamp} value={equalizer.settings.preamp}
        style:--range-progress={`${(equalizer.settings.preamp + 24) / 24 * 100}%`}
        aria-valuetext={db(equalizer.settings.preamp)}
        oninput={(event) => equalizer.setPreamp(event.currentTarget.valueAsNumber)} onchange={equalizer.flush} />
      <label class="toggle auto">
        <input type="checkbox" checked={equalizer.settings.autoPreamp}
          onchange={(event) => equalizer.setAutoPreamp(event.currentTarget.checked)} />
        Auto
      </label>
    </div>
  </fieldset>

  {#if equalizer.error}<p class="eq-error" role="alert">{equalizer.error}</p>{/if}
  {#if notice}<p class="eq-notice" role="status">{notice}</p>{/if}
</dialog>

<style>
  .equalizer-dialog { width: min(680px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); padding: 24px; overflow: auto; border: 1px solid var(--color-line); border-radius: 20px; color: var(--color-text); background: var(--color-raised); box-shadow: 0 24px 90px #0005; }
  .equalizer-dialog::backdrop { background: #0008; }
  header, .eq-toolbar { display: flex; align-items: center; gap: 12px; }
  header { justify-content: space-between; margin-bottom: 22px; }
  h2 { margin: 0; font-size: 19px; }
  button, select { min-height: 34px; padding: 7px 12px; border: 1px solid var(--color-line); border-radius: 9px; color: inherit; background: var(--color-panel); font: inherit; font-size: 12px; cursor: pointer; }
  button:hover { background: var(--color-hover); }
  select:focus-visible { outline: 2px solid var(--color-accent-ink); outline-offset: 3px; }
  .close-button { display: grid; place-items: center; width: 34px; padding: 7px; }
  .close-button svg { width: 18px; height: 18px; }
  fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
  .toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
  input { accent-color: var(--color-accent); }
  .toggle input { width: 16px; height: 16px; margin: 0; }
  .preset { margin-left: auto; min-width: 0; }
  select { width: 100%; max-width: 180px; }
  .bands { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 8px; margin: 26px 0; padding: 16px 8px; border: 1px solid var(--color-line); border-radius: 14px; background: var(--color-panel); transition: opacity 140ms ease; }
  .bands.bypassed { opacity: .65; }
  .band { display: flex; min-width: 0; align-items: center; flex-direction: column; gap: 12px; text-align: center; }
  .band output { font-size: 10px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .band-slider { writing-mode: vertical-lr; direction: rtl; width: 24px; height: 160px; min-height: 0; margin: 0; cursor: ns-resize; }
  .band-slider::-webkit-slider-runnable-track { width: 4px; height: 100%; background: linear-gradient(to top, var(--color-accent) var(--band-fill), var(--color-line) var(--band-fill)); }
  .band-slider::-webkit-slider-thumb { margin: 0 0 0 -4px; }
  .band-slider::-moz-range-track { width: 4px; height: 100%; }
  .band-slider::-moz-range-progress { width: 4px; }
  .band > span { display: grid; gap: 2px; font-size: 11px; }
  small { color: var(--color-muted); font-size: 9px; }
  .preamp { display: grid; grid-template-columns: 1fr auto; gap: 10px 14px; align-items: center; font-size: 13px; }
  .preamp output { color: var(--color-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .preamp > input { min-width: 0; width: 100%; margin: 0; }
  .preamp > input:disabled { opacity: .35; }
  .auto { justify-self: end; }
  .eq-error { margin: 16px 0 0; color: var(--color-error); font-size: 12px; }
  .eq-notice { margin: 16px 0 0; color: var(--color-muted); font-size: 12px; line-height: 1.5; }
  @media (max-width: 520px) {
    .equalizer-dialog { padding: 18px; }
    header { margin-bottom: 16px; }
    .eq-toolbar { gap: 8px; }
    .toggle { gap: 6px; font-size: 12px; }
    button, select { padding: 7px 9px; }
    .bands { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 20px 8px; margin: 18px 0; padding: 12px 8px; }
    .band { gap: 7px; }
    .band-slider { height: 90px; }
  }
  @media (prefers-reduced-motion: reduce) { .bands { transition: none; } }
</style>
