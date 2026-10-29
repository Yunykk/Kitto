<script lang="ts">
  import type { ThemeId } from "../appearance";
  import type { CoverStatus } from "../types";
  import RecordArtwork from "./RecordArtwork.svelte";
  import CoverArtwork from "./CoverArtwork.svelte";

  let { theme, title, coverUrl, coverStatus, isPlaying }: {
    theme: ThemeId;
    title: string;
    coverUrl: string | null;
    coverStatus: CoverStatus;
    isPlaying: boolean;
  } = $props();
</script>

{#snippet meterScale()}
  <svg class="meter-scale" viewBox="0 0 160 70" preserveAspectRatio="none" fill="none">
    <path d="M16 47Q80-3 144 47" stroke="#59452d" stroke-width="1.2" />
    <path d="m17 47-4-5m17-6-3-5m17-2-2-6m18 1-1-6m21 4v-6m20 8 1-6m15 11 2-6m12 13 3-5m9 16 4-5" stroke="#59452d" stroke-width="1.4" />
    <path d="M100 24q26 5 44 23" stroke="#a9472b" stroke-width="1.4" />
  </svg>
{/snippet}

{#if theme === "orbit"}
  <RecordArtwork {coverUrl} {coverStatus} {isPlaying} />
{:else if theme === "tape-deck"}
  <div class="tape-deck-art" aria-hidden="true">
    <div class="deck-machine">
      <div class="wood-cheek wood-left"></div><div class="wood-cheek wood-right"></div>
      <div class="deck-face">
        <span class="deck-screw screw-tl"></span><span class="deck-screw screw-tr"></span>
        <span class="deck-screw screw-bl"></span><span class="deck-screw screw-br"></span>
        <div class="deck-status"><i class:lit={isPlaying}></i></div>
        <div class="cassette">
          <div class="reel-window" class:playing={isPlaying}>
            <div class="tape-reel"><span class="reel-hub"><i></i><i></i><i></i></span></div>
            <div class="tape-bridge"></div>
            <div class="tape-reel"><span class="reel-hub"><i></i><i></i><i></i></span></div>
            <span class="glass-shine"></span>
          </div>
          <div class="tape-caption"><span>{title === "Your library is empty" ? "" : title}</span></div>
        </div>
        <div class="deck-instruments">
          <div class="vu-meter">{@render meterScale()}<i style:--needle={isPlaying ? "-18deg" : "-43deg"}></i></div>
          <div class="vu-meter">{@render meterScale()}<i style:--needle={isPlaying ? "9deg" : "-43deg"}></i></div>
          <div class="deck-knob"><span></span></div>
        </div>
      </div>
    </div>
  </div>
{:else if theme === "editorial"}
  <div class="editorial-art" aria-hidden="true">
    <div class="editorial-vinyl"><span></span></div>
    <div class="editorial-book">
      <div class="book-cover"><div class="book-image"><CoverArtwork {coverUrl} {coverStatus} /></div></div>
    </div>
  </div>
{:else if theme === "floating-bento"}
  <div class="bento-art" aria-hidden="true">
    <div class="bento-album"><CoverArtwork {coverUrl} {coverStatus} /></div>
  </div>
{:else if theme === "paper-club"}
  <div class="paper-art" aria-hidden="true">
    <div class="paper-sleeve"><CoverArtwork {coverUrl} {coverStatus} /></div>
  </div>
{:else}
  <div class="ceramic-art" aria-hidden="true">
    <div class="ceramic-shell">
      <div class="ceramic-well"><div class="ceramic-cone"><div class="ceramic-album"><CoverArtwork {coverUrl} {coverStatus} /></div></div></div>
      <div class="ceramic-bottom"><span class="ceramic-dot" class:lit={isPlaying}></span><span class="ceramic-knob"></span></div>
    </div>
  </div>
{/if}

<style>
.tape-deck-art, .editorial-art, .ceramic-art { position: relative; flex: none; isolation: isolate; container-type: inline-size; }
  .tape-caption, .vu-meter, .ceramic-bottom { font-family: Consolas, "Courier New", monospace; }
  .ceramic-art { --clay: #e5ddce; --clay-light: #fffdf6; --clay-dark: #b7ad9c; width: min(91cqw, 105cqh, 465px); aspect-ratio: 1.05; }
  .ceramic-shell { position: absolute; inset: 4% 9% 11%; border: 1px solid var(--clay-light); border-radius: 24% 24% 20% 20%; background: radial-gradient(ellipse at 18% 5%, #fff 0, transparent 56%), linear-gradient(135deg, var(--clay-light), var(--clay) 70%, var(--clay-dark)); box-shadow: inset 2px 3px 3px #fff9, inset -5px -7px 12px #685d3b26, 3px 6px 0 var(--clay-dark), 9px 18px 22px #63523e24, 18px 30px 36px #63523e28; transform: perspective(1000px) rotateY(-9deg) rotateX(6deg) rotateZ(-4deg); }
  .ceramic-shell::before { position: absolute; inset: 1.5%; border: 1px solid #fff5; border-radius: inherit; content: ""; pointer-events: none; }
  .ceramic-well { position: absolute; inset: 22% 12% 16%; padding: 8%; border: 1px solid #a49b8b; border-radius: 50%; background: linear-gradient(145deg, #8f877a, #f7f2e6 48%, #fffdf6); box-shadow: inset 3px 5px 9px #5a514b70, 0 2px 1px #fff; }
  .ceramic-cone { position: relative; width: 100%; height: 100%; border-radius: 50%; background: repeating-radial-gradient(ellipse, transparent 0 9%, #00000008 9.5% 10%, transparent 10.5% 13%), radial-gradient(circle, #d3cbba 5%, #9e9584 26%, #e9e2d1 48%, #f5f0e4 59%, #beb4a1 75%, #e0d7c6 91%); box-shadow: inset 1px 2px 5px #fff7, inset -2px -4px 7px #574d3b40, 0 2px 8px #51483840; }
  .ceramic-album { position: absolute; inset: 9%; overflow: hidden; border-radius: 50%; box-shadow: 0 3px 9px #0007; }
  .ceramic-bottom { position: absolute; inset: auto 12% 7%; display: flex; align-items: center; gap: 8px; color: #8a7d67; font-size: clamp(5px, .9cqw, 7px); letter-spacing: .7px; }
  .ceramic-dot { width: 5px; height: 5px; flex: none; border-radius: 50%; background: #9c9c79; box-shadow: inset 0 1px 2px #0004; }.ceramic-dot.lit { background: #a2b466; box-shadow: 0 0 5px #a2b466; }
  .ceramic-knob { width: 23px; height: 23px; margin-left: auto; flex: none; border: 1px solid #c0b6a5; border-radius: 50%; background: conic-gradient(from 30deg, #fffdf7, #c5bca9, #f5efdf, #fffdf7); box-shadow: 1px 2px 3px #70644a55; }
  :global([data-mode="dark"]) .ceramic-art { --clay: #424442; --clay-light: #6a6d67; --clay-dark: #252925; }
  :global([data-mode="dark"]) .ceramic-shell { background: radial-gradient(ellipse at 18% 5%, #80847b 0, transparent 55%), linear-gradient(135deg, var(--clay-light), var(--clay) 70%, var(--clay-dark)); border-color: #85877d; box-shadow: inset 2px 3px 3px #dce6d633, inset -5px -7px 12px #0005, 3px 6px 0 #1e231e, 9px 18px 22px #0006, 18px 30px 36px #0004; }
  :global([data-mode="dark"]) .ceramic-bottom { color: #c1c0ad; }
  :global([data-mode="dark"]) .ceramic-well { border-color: #292e28; background: linear-gradient(145deg, #181c17, #606859 55%, #939984); box-shadow: inset 3px 5px 9px #000a, 0 2px 1px #b4b99e55; }
  :global([data-mode="dark"]) .ceramic-cone { background: repeating-radial-gradient(ellipse, transparent 0 9%, #ffffff06 9.5% 10%, transparent 10.5% 13%), radial-gradient(circle, #333b31, #141d15 27%, #69715d 50%, #939b82 63%, #343d30 85%, #777f69); }
  .editorial-art { width: min(94cqw, 122cqh, 620px); aspect-ratio: 1.22; perspective: 1100px; }
  .editorial-vinyl { position: absolute; top: 17%; right: 5%; width: 61%; aspect-ratio: 1; border: 2px solid #5f625f; border-radius: 50%; background: repeating-radial-gradient(circle, #0c0e0d 0 1px, #414440 1.5px 2px, #131615 2.5px 4px), #161816; box-shadow: 5px 12px 15px #0004, 0 2px 0 #090b09; transform: rotate(-8deg); }
  .editorial-vinyl::after { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(from -40deg, transparent 0 18%, #ffffff30 24%, transparent 34% 69%, #ffffff21 75%, transparent 82%); content: ""; }.editorial-vinyl > span { position: absolute; inset: 37%; border: 6px solid var(--color-accent); border-radius: 50%; background: #171917; box-shadow: 0 0 0 1px #000; }
  .editorial-book { position: absolute; inset: 10% 24% 9% 8%; transform: rotateY(-15deg) rotateZ(-7deg); transform-style: preserve-3d; }
  .editorial-book::before { position: absolute; inset: 1% auto -1% -5%; width: 6%; border: 1px solid #837b6e; background: linear-gradient(90deg, #c7beab, #f7efdb 30%, #d9cdb2 85%, #8a7a5f); transform: skewY(-10deg); content: ""; box-shadow: inset 2px 0 2px #fff6; }.editorial-book::after { position: absolute; inset: auto -1.5% -2% 0; height: 3%; background: repeating-linear-gradient(0deg, #e3dbcc 0 1px, #a89d8c 1px 2px); transform: skewX(50deg); content: ""; }
  .book-cover { position: absolute; inset: 0; overflow: hidden; border: 1px solid #fff8; color: #232522; background: #f6f0df; box-shadow: inset 3px 0 5px #8a785925, 10px 16px 20px #0003, 25px 32px 44px #0003; }.book-cover::after { position: absolute; inset: 0; background: linear-gradient(115deg, #fff8, transparent 27% 80%, #0001), repeating-linear-gradient(0deg, transparent 0 3px, #594d3807 3px 4px); content: ""; pointer-events: none; }
  .book-image { position: absolute; inset: 0; }
  .tape-deck-art { width: min(94cqw, 147cqh, 650px); aspect-ratio: 1.47; }
  .deck-machine { position: absolute; inset: 3% 1% 6%; border-radius: 7px; filter: drop-shadow(8px 20px 15px #0005); }
  .wood-cheek { position: absolute; top: 0; bottom: -2%; width: 5.5%; border: 1px solid #301b10; border-radius: 5px; background: repeating-linear-gradient(93deg, #0000 0 3px, #2f160d55 3.5px 5px, #d3986222 6px 8px), linear-gradient(90deg, #3c2114, #976647 32%, #7b4b30 70%, #30170d); box-shadow: inset 1px 2px 2px #e5b38a77, 1px 3px 0 #2e190f; }.wood-left { left: 0; }.wood-right { right: 0; }
  .deck-face { position: absolute; inset: 2% 5%; display: flex; flex-direction: column; gap: 5%; padding: 4% 5% 5%; border: 1px solid #c9c8bd; border-radius: 3px; color: #282b2b; background: repeating-linear-gradient(0deg, #ffffff09 0 1px, #00000004 1px 2px), linear-gradient(130deg, #ebece3, #c2c6c3 50%, #a6adaa 95%); box-shadow: inset 0 2px 2px #fff, inset -1px -2px 2px #6b7473, 0 5px 0 #646c67, 0 8px 1px #353d38; }
  .cassette { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 3%; border: 1px solid #3b4140; border-radius: 5px; background: #242927; box-shadow: inset 0 3px 7px #000b, 0 1px 1px #fff9, 0 0 0 3px #868d86; }
  .reel-window { position: relative; flex: 1; display: flex; align-items: center; justify-content: space-between; min-height: 0; padding: 3% 9%; overflow: hidden; border: 1px solid #59625b; border-radius: 3px; background: radial-gradient(ellipse at 50% 80%, #41473b, #131c18 75%); box-shadow: inset 0 4px 10px #000, 0 1px #ffffff18; }
  .glass-shine { position: absolute; inset: 0; z-index: 3; pointer-events: none; background: linear-gradient(130deg, #ffffff09 0 20%, #ffffff16 20% 27%, transparent 27% 77%, #ffffff05 77%); }
  .tape-reel { position: relative; z-index: 2; width: 32%; aspect-ratio: 1; flex: none; border: 1px solid #665e4d; border-radius: 50%; background: repeating-radial-gradient(circle, #594230 0 1px, #302e23 1.5px 3px); box-shadow: 0 3px 9px #000a, inset 0 0 0 3px #1d231e; }
  .reel-hub { position: absolute; inset: 15%; border: 2px solid #a1a89c; border-radius: 50%; background: conic-gradient(from 10deg, #c7cec2, #6c776b 25%, #e1e4d5 48%, #7e8b7c 70%, #c7cec2); box-shadow: inset 0 1px 2px #fff9, 0 2px 3px #0008; animation: reel-turn 7s linear infinite; animation-play-state: paused; }.reel-hub::after { position: absolute; inset: 35%; border: 2px solid #d6d8ca; border-radius: 50%; background: #202b24; box-shadow: 0 0 0 1px #3e473b; content: ""; }.reel-hub i { position: absolute; top: 9%; left: 39%; width: 22%; height: 29%; border: 1px solid #727c6c; border-radius: 45%; background: #263129; transform-origin: 50% 142%; box-shadow: inset 0 2px 3px #000a; }.reel-hub i:nth-child(2) { transform: rotate(120deg); }.reel-hub i:nth-child(3) { transform: rotate(240deg); }.playing .reel-hub { animation-play-state: running; }
  .tape-bridge { position: absolute; inset: 24% 20%; border-top: 2px solid #453e2e; border-bottom: 2px solid #453e2e; }
  .tape-caption { display: flex; align-items: center; gap: 7px; flex: none; padding-top: 2%; min-width: 0; color: #c3c5b6; font-size: clamp(6px, 1.3cqw, 10px); }.tape-caption > span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .deck-instruments { flex: none; height: 21%; display: flex; align-items: center; gap: 4%; }.vu-meter { position: relative; align-self: stretch; flex: 1; overflow: hidden; border: 2px solid #3c403a; border-radius: 3px; background: radial-gradient(ellipse at 50% 75%, #fff1c3, #e4c78b 65%, #b49b70); box-shadow: inset 0 2px 5px #47391990, 0 1px #fff8; color: #403522; }.meter-scale { position: absolute; inset: 7% 3% 8%; width: 94%; height: 85%; }.vu-meter > i { position: absolute; bottom: -7%; left: 49%; height: 78%; width: 1px; background: #8f351f; transform-origin: 50% 100%; transform: rotate(var(--needle)); box-shadow: 1px 0 1px #0004; transition: transform 600ms ease; }
  .deck-knob { display: grid; place-items: center; width: 9%; aspect-ratio: 1; flex: none; border: 1px solid #737f72; border-radius: 50%; background: conic-gradient(#cdd4c6, #889782, #f5f5e7, #a5b19c, #cdd4c6); box-shadow: 2px 3px 3px #0005, inset 0 1px 1px #fff8; }.deck-knob > span { width: 2px; height: 28%; margin-top: -45%; background: #5b634e; }
  .deck-screw { position: absolute; width: 5px; height: 5px; border: 1px solid #7e877a; border-radius: 50%; background: linear-gradient(135deg, #c8cec0 40%, #5d675a 45% 55%, #c8cec0 60%); }.screw-tl { top: 2%; left: 2%; }.screw-tr { top: 2%; right: 2%; }.screw-bl { bottom: 2%; left: 2%; }.screw-br { bottom: 2%; right: 2%; }
  :global([data-mode="dark"]) .deck-face { border-color: #737a71; color: #d7decd; background: repeating-linear-gradient(0deg, #ffffff05 0 1px, #00000009 1px 2px), linear-gradient(130deg, #4d564d, #2d382f 50%, #202a22 95%); box-shadow: inset 0 2px 2px #b2bca655, inset -1px -2px 2px #10180e, 0 5px 0 #121d13, 0 8px 1px #0a120a; }

  @keyframes reel-turn { to { transform: rotate(360deg); } }
  @media (max-width: 460px) {
    .ceramic-knob { width: 15px; height: 15px; }.ceramic-bottom { gap: 4px; }
    .editorial-book { inset: 11% 26% 11% 10%; }.deck-face { gap: 4%; }.tape-caption { gap: 4px; }.deck-screw { width: 4px; height: 4px; }
  }
  @media (prefers-reduced-motion: reduce) { .reel-hub { animation: none; }.vu-meter > i { transition: none; } }

  .deck-status { display: flex; justify-content: flex-end; flex: none; height: 6%; min-height: 4px; }
  .deck-status i { width: 5px; height: 5px; border: 1px solid #67695a; border-radius: 50%; background: #747b59; }
  .deck-status i.lit { background: #b0cd6d; box-shadow: 0 0 6px #aec15b; }
  .bento-art, .paper-art { position: relative; width: min(88cqw, 88cqh, 430px); aspect-ratio: 1; }
  .bento-album { position: absolute; inset: 0; overflow: hidden; border: 1px solid var(--material-edge); border-radius: 22px; background: var(--color-surface); box-shadow: inset 0 1px 1px var(--material-highlight), 0 8px 22px var(--material-shadow); }
  .paper-sleeve { position: absolute; inset: 0; padding: 5%; border: 1px solid var(--color-line); background: repeating-linear-gradient(0deg, #7d684b06 0 1px, transparent 1px 3px), var(--color-raised); box-shadow: 1px 2px 0 var(--color-line), 0 8px 18px var(--material-shadow); }
</style>
