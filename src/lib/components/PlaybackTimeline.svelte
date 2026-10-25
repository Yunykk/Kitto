<script lang="ts">
  type Props = {
    time: number;
    duration: number;
    disabled: boolean;
    onstart: (event: PointerEvent) => void;
    onpreview: (event: Event) => void;
    oncommit: () => void;
    oncancel: () => void;
  };

  let { time, duration, disabled, onstart, onpreview, oncommit, oncancel }: Props = $props();

  let range = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (!range) return;

    // Update max first.
    range.max = String(duration || 1);
    range.value = String(time);
  });

  function formatTime(seconds: number) {
    const totalSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(totalSeconds / 60);
    const remainder = totalSeconds % 60;
    return `${minutes}:${remainder.toString().padStart(2, "0")}`;
  }
</script>

<svelte:window onpointerup={oncommit} onpointercancel={oncancel} onblur={oncancel} />

<div class="timeline">
  <span>{formatTime(time)}</span>

  <input
    type="range"
    bind:this={range}
    min="0"
    step="0.1"
    disabled={disabled}
    aria-label="Playback position"
    aria-valuetext={`${formatTime(time)} of ${formatTime(duration)}`}
    onpointerdown={onstart}
    oninput={onpreview}
    onchange={oncommit}
    onblur={oncancel}
  />

  <span>{formatTime(duration)}</span>
</div>
