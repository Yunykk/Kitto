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
      <img src="/kitto.svg" width="32" height="32" alt="" />
      <h1>{productName}</h1>
    </div>
    <span class="app-label">Local music player</span>
  </header>

  <main class="app-main">
    <Player />
  </main>
</div>
