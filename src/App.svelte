<script lang="ts">
  import { productName } from "../src-tauri/tauri.conf.json";
  import Player from "./lib/components/Player.svelte";
  import SettingsPanel from "./lib/components/SettingsPanel.svelte";
  import { createAppearance } from "./lib/appearance.svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { createFavorites } from "./lib/favorites.svelte";
  import { createListeningStats } from "./lib/listening.svelte";
  import ListeningStatsPanel from "./lib/components/ListeningStatsPanel.svelte";
  import { onMount } from "svelte";
  import { isDesktopRuntime } from "./lib/runtime";
  import { registerAndroidBack } from "./lib/mobile-back";
  import { createTuning } from "./lib/tuning.svelte";
  import { configureTuning } from "./lib/audio";
  import { createMusicFolders } from "./lib/music-folders.svelte"; 
  import { 
    pickDesktopMusicFolder,
    scanDesktopMusicFolder,
    type FolderScanResult,
  } from "./lib/music-folder-access"


  const appearance = createAppearance();
  const favorites = createFavorites();
  const listeningStats = createListeningStats();
  const tuning = createTuning(configureTuning);
  let player = $state<{
    playHistoryTrack: (id: string) => void;
    importFolderFiles: (
      files: FolderScanResult["files"],
    ) => string[] | null;
    handleMobileBack: () => boolean;
    prepareForExit: () => void;
  }>();

  const musicFolders = createMusicFolders(
    {
      pick: pickDesktopMusicFolder,
      scan: scanDesktopMusicFolder,
    },
    (files) => player?.importFolderFiles(files) ?? null,
  );
  
  let statsOpen = $state(false);
  let settingsOpen = $state(false);

  $effect(() => {
    const mode = appearance.mode;
    if (!appearance.isReady || !isDesktopRuntime()) return;

    void getCurrentWindow().setTheme(mode).catch((error) => {
      console.warn("Could not update window theme.", error);
    });
  });

  onMount(() => registerAndroidBack({
    navigate: () => player?.handleMobileBack() ?? false,
    beforeExit: () => player?.prepareForExit(),
  }));
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
      <button class="settings-trigger" type="button" aria-label="Open listening statistics"
        aria-haspopup="dialog" title="Listening statistics" onclick={() => statsOpen = true}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
          <path d="M4 20V10m8 10V4m8 16v-7" />
        </svg>
        <span>Stats</span>
      </button>
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
    <Player bind:this={player} theme={appearance.theme} {favorites} {listeningStats} />
  </main>
</div>

<SettingsPanel
  {tuning}
  {appearance}
  {favorites}
  {musicFolders}
  open={settingsOpen}
  onclose={() => settingsOpen = false}
/>

<ListeningStatsPanel
  open={statsOpen}
  summary={listeningStats.summary}
  isReady={listeningStats.isReady}
  error={listeningStats.error}
  onclose={() => { listeningStats.flush(); statsOpen = false; }}
  onplay={(id) => { player?.playHistoryTrack(id); statsOpen = false; }}
  onreset={listeningStats.clear}
/>
