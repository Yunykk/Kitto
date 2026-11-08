<script lang="ts">
  import CollectionDialog from "./CollectionDialog.svelte";
  import type { ListeningSummary } from "../listening-types";

  let { open, summary, isReady, error, onclose, onplay, onreset }: {
    open: boolean;
    summary: ListeningSummary;
    isReady: boolean;
    error: string;
    onclose: () => void;
    onplay: (trackId: string) => void;
    onreset: () => boolean;
  } = $props();

  let dialog = $state<HTMLDialogElement>();
  const id = $props.id();
  let confirmOpen = $state(false);

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  $effect(() => {
    if (!open) confirmOpen = false;
  });

  function close() {
    confirmOpen = false;
    onclose();
  }

  function backdrop(event: MouseEvent) {
    if (!dialog || event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  }

  function fmt(seconds: number): string {
    const s = Math.round(seconds);
    if (s < 60) return `${s}s`;
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const rem = s % 60;
    if (h > 0) return rem ? `${h}h ${m}m ${rem}s` : `${h}h ${m}m`;
    return rem ? `${m}m ${rem}s` : `${m}m`;
  }

  function dateLabel(ts: number): string {
    return new Date(ts).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
  }

  const maxDay = $derived(Math.max(1, ...summary.days.map((d) => d.seconds)));
  const trulyEmpty = $derived(
    summary.totals.seconds === 0 && summary.totals.plays === 0 &&
    summary.totals.tracks === 0 && summary.totals.artists === 0 &&
    summary.recent.length === 0
  );
  const clearDisabled = $derived(!isReady || (trulyEmpty && !error));
</script>

<dialog bind:this={dialog} class="listening-dialog" aria-labelledby={`${id}-heading`}
  onclose={close} oncancel={(event) => { event.preventDefault(); close(); }} onclick={backdrop}>
  <header>
    <h2 id={`${id}-heading`}>Listening statistics</h2>
    <button class="close-button" type="button" aria-label="Close listening statistics" onclick={close}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
        <path d="m6 6 12 12M18 6 6 18" />
      </svg>
    </button>
  </header>

  {#if !isReady}
    <p class="state">Loading…</p>
  {:else if error}
    <p class="state error" role="alert">{error}</p>
  {/if}

  {#if isReady && trulyEmpty}
    <p class="empty">No listening history yet<br />Play some music to see your listening stats.</p>
  {:else if isReady}
    <div class="cards">
      <div class="card"><span class="label">Listening time</span><strong>{fmt(summary.totals.seconds)}</strong></div>
      <div class="card"><span class="label">Qualified plays</span><strong>{summary.totals.plays}</strong></div>
      <div class="card"><span class="label">Unique tracks</span><strong>{summary.totals.tracks}</strong></div>
      <div class="card"><span class="label">Unique artists</span><strong>{summary.totals.artists}</strong></div>
    </div>
    <p class="note">A play counts after 30 seconds, or half of a short track.</p>

    <section class="today">
      <h3>Today</h3>
      <span>{fmt(summary.today.seconds)} · {summary.today.plays} plays</span>
    </section>

    <section class="days">
      <h3>7-day activity</h3>
      <div class="bars" role="group" aria-label="7-day listening activity">
        {#each summary.days as day (day.date)}
          <div class="bar-col">
            <div class="plot">
              <div class="bar" style:height={`${(day.seconds / maxDay) * 100}%`} role="img" title={`${day.date}: ${fmt(day.seconds)}, ${day.plays} plays`} aria-label={`${day.date}: ${fmt(day.seconds)}, ${day.plays} plays`}></div>
            </div>
            <span class="day-label">{day.label}</span>
          </div>
        {/each}
      </div>
    </section>

    <div class="lists">
      <section>
        <h3>Top tracks</h3>
        <ul>
          {#each summary.topTracks.slice(0, 10) as t (t.trackId)}
            <li>
              <button type="button" class="row" disabled={!t.available} title={t.available ? "" : "Track unavailable"} onclick={() => t.available && onplay(t.trackId)}>
                <span class="title">{t.title}</span>
                <span class="meta">{t.artist ?? "Unknown artist"} · {fmt(t.seconds)} · {t.plays} plays</span>
              </button>
            </li>
          {/each}
        </ul>
      </section>
      <section>
        <h3>Top artists</h3>
        {#if summary.topArtists.length === 0}
          <p class="muted">No artist metadata available.</p>
        {:else}
          <ul>
            {#each summary.topArtists.slice(0, 10) as a (a.name)}
              <li>
                <div class="row static">
                  <span class="title">{a.name}</span>
                  <span class="meta">{fmt(a.seconds)} · {a.plays} plays</span>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>

    <section class="recent">
      <h3>Recently played</h3>
      <ul>
        {#each summary.recent.slice(0, 20) as r (r.sessionId)}
          <li>
            <button type="button" class="row" disabled={!r.available} title={r.available ? "" : "Track unavailable"} onclick={() => r.available && onplay(r.trackId)}>
              <span class="title">{r.title}</span>
              <span class="meta">{r.artist ?? "Unknown artist"} · {fmt(r.seconds)} · {dateLabel(r.playedAt)}{r.qualified ? "" : " · partial"}</span>
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <div class="clear-row">
    <button type="button" class="clear-button" disabled={clearDisabled} onclick={() => (confirmOpen = true)}>Clear statistics</button>
  </div>
</dialog>

<CollectionDialog
  open={confirmOpen}
  title="Clear listening statistics?"
  message="This will permanently delete all listening statistics. This action cannot be undone."
  confirmLabel="Clear statistics"
  mode="confirm"
  error={error}
  onsubmit={() => onreset()}
  onclose={() => (confirmOpen = false)}
/>

<style>
  .listening-dialog { width: min(780px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); padding: 20px; overflow: auto; border: 1px solid var(--color-line); border-radius: 20px; color: var(--color-text); background: var(--color-raised); box-shadow: 0 24px 90px #0005; }
  .listening-dialog::backdrop { background: #0008; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; min-width: 0; }
  h2 { margin: 0; font-size: 19px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  h3 { margin: 0 0 8px; font-size: 13px; color: var(--color-muted); text-transform: uppercase; letter-spacing: .6px; }
  .close-button { display: grid; place-items: center; width: 34px; height: 34px; padding: 0; border: 1px solid var(--color-line); border-radius: 9px; background: var(--color-panel); color: inherit; cursor: pointer; flex: none; transition: background 140ms ease; }
  .close-button:hover { background: var(--color-hover); }
  .state { color: var(--color-muted); font-size: 13px; }
  .state.error { color: var(--color-error); }
  .empty { text-align: center; color: var(--color-muted); font-size: 13px; line-height: 1.6; margin: 24px 0; }
  .muted { color: var(--color-muted); font-size: 12px; }
  .note { color: var(--color-muted); font-size: 11px; margin: 0 0 16px; }
  .cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; min-width: 0; }
  .card { display: grid; gap: 4px; padding: 10px; border: 1px solid var(--color-line); border-radius: 12px; background: var(--color-panel); min-width: 0; }
  .card .label { font-size: 11px; color: var(--color-muted); }
  .card strong { font-size: 16px; font-variant-numeric: tabular-nums; }
  .today { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border: 1px solid var(--color-line); border-radius: 12px; background: var(--color-panel); margin-bottom: 16px; font-size: 13px; min-width: 0; }
  .days { margin-bottom: 16px; min-width: 0; }
  .bars { display: flex; align-items: flex-end; gap: 6px; height: 80px; }
  .bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; height: 100%; }
  .plot { flex: 1; min-height: 0; width: 100%; display: flex; align-items: flex-end; }
  .bar { width: 100%; background: var(--color-accent); border-radius: 4px 4px 0 0; }
  .day-label { font-size: 10px; color: var(--color-muted); }
  .lists { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; margin-bottom: 16px; min-width: 0; }
  section { min-width: 0; }
  ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; min-width: 0; }
  .row { width: 100%; min-width: 0; display: grid; gap: 2px; padding: 8px 10px; border: 1px solid var(--color-line); border-radius: 10px; background: var(--color-panel); text-align: left; font: inherit; color: inherit; cursor: pointer; transition: background 140ms ease; }
  .row:hover { background: var(--color-hover); }
  .row:disabled { opacity: .5; cursor: not-allowed; }
  .row.static { cursor: default; }
  .title { font-size: 13px; font-weight: 500; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { font-size: 11px; color: var(--color-muted); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .recent { margin-bottom: 16px; min-width: 0; }
  .clear-row { display: flex; justify-content: flex-end; padding-top: 8px; border-top: 1px solid var(--color-line); }
  .clear-button { padding: 8px 12px; border: 1px solid color-mix(in srgb, var(--color-error) 30%, transparent); border-radius: 9px; background: color-mix(in srgb, var(--color-error) 12%, var(--color-raised)); color: var(--color-error); font-size: 12px; cursor: pointer; transition: background 140ms ease; }
  .clear-button:disabled { opacity: .5; cursor: not-allowed; }
  @media (max-width: 760px) {
    .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .lists { grid-template-columns: minmax(0, 1fr); }
  }
  @media (max-width: 360px) {
    .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (prefers-reduced-motion: reduce) { .bar, .close-button, .row, .clear-button { transition: none; } }
</style>
