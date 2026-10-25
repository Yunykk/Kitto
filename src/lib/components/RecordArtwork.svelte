<script lang="ts">
  let { progress }: { progress: number } = $props();
</script>

<div class="record-artwork" aria-hidden="true">
  <svg class="progress-ring" viewBox="0 0 400 400" fill="none">
    <circle cx="200" cy="200" r="190" stroke="var(--color-line)" />
    <circle
      cx="200"
      cy="200"
      r="190"
      stroke="var(--color-accent)"
      stroke-width="2.5"
      stroke-linecap="round"
      pathLength="100"
      stroke-dasharray={`${progress * 100} 100`}
      transform="rotate(-90 200 200)"
    />
    <g transform={`rotate(${progress * 360} 200 200)`}>
      <circle cx="200" cy="10" r="5" fill="var(--color-accent)" />
    </g>
  </svg>
  <div class="record">
    <span class="record-center"></span>
  </div>
</div>
