<script lang="ts">
  import { productName } from "../src-tauri/tauri.conf.json";
  import Player from "./lib/components/Player.svelte";
  import SettingsPanel from "./lib/components/SettingsPanel.svelte";
  import { createAppearance } from "./lib/appearance.svelte";
  import { isTauri } from "@tauri-apps/api/core";
  import { getCurrentWindow } from "@tauri-apps/api/window";

  const appearance = createAppearance();
  let settingsOpen = $state(false);

  $effect(() => {
    const mode = appearance.mode;
    if (!appearance.isReady || !isTauri()) return;

    void getCurrentWindow().setTheme(mode).catch((error) => {
      console.warn("Could not update window theme.", error);
    });
  });
</script>

<svelte:head>
  <title>{productName}</title>
  <meta name="description" content="Your local music." />
</svelte:head>

<div class="app-shell">
  <header class="app-header">
    <div class="brand">
      <img src="/kitto.svg" width="32" height="32" alt="" />
      <h1>{productName}</h1>
    </div>
    <div class="header-actions">
      <button
        class="settings-trigger"
        type="button"
        aria-label="Open settings"
        aria-haspopup="dialog"
        title="Settings"
        onclick={() => settingsOpen = true}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
          <path d="M9.5 3h5l.7 2.5 2.2 1.3 2.5-.6 2.5 4.3-1.8 1.8v2.5l1.8 1.8-2.5 4.3-2.5-.6-2.2 1.3-.7 2.4h-5l-.7-2.4-2.2-1.3-2.5.6L1.6 17l1.8-1.8v-2.5l-1.8-1.8 2.5-4.3 2.5.6 2.2-1.3Z" transform="translate(1 0) scale(.9)" />
          <circle cx="12" cy="12" r="3.2" />
        </svg>
        <span>Settings</span>
      </button>
    </div>
  </header>

  <main class="app-main">
    <Player theme={appearance.theme} />
  </main>
</div>

<SettingsPanel {appearance} open={settingsOpen} onclose={() => settingsOpen = false} />
