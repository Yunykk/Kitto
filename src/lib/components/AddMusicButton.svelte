<script lang="ts">
  type Props = {
    isChoosingFiles: boolean;
    onadd: () => void;
  };

  let { isChoosingFiles, onadd }: Props = $props();
</script>

<button
  class="choose-files"
  type="button"
  disabled={isChoosingFiles}
  onclick={onadd}
>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
    <path d="M12 5v14M5 12h14" stroke-linecap="round" />
  </svg>
  <span>{isChoosingFiles ? "Opening…" : "Add music"}</span>
</button>
