<script lang="ts">
  import { productName } from "../src-tauri/tauri.conf.json";
  import Player from "./lib/components/Player.svelte";
</script>

<svelte:head>
  <title>{productName}</title>
  <meta name="description" content="Your local music." />
</svelte:head>

<div class="app-shell">
  <header class="app-header">
    <div class="brand">
      <img src="/kitto.svg" width="40" height="40" alt="" />
      <h1>{productName}</h1>
    </div>

    <span class="library-label">
      <span class="status-dot" aria-hidden="true"></span>
      Library
    </span>
  </header>

  <main>
    <Player />
  </main>

  <footer class="app-footer">
    <span>Local music</span>
    <span>Kitto</span>
  </footer>
</div>
