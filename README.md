<p align="center">
  <img src="public/kitto.svg" alt="Kitto" width="64" height="64" />
</p>

<h1 align="center">Kitto</h1>

<p align="center"><strong>i got tired of spotify</strong></p>

Kitto is a local music player for your own collection, with a clean interface and a warm visual style. Play your files, organize your queue, find tracks by name, artist, or album, and return to where you left off.

The goal is to keep everyday listening simple while gradually adding more ways to shape your sound, explore your listening habits, and share music with others.

**Kitto is in early development. Windows is the current development target, with Android and Linux planned. (also maybe IOS? idkidk)**

## What works now

- Local audio playback with a native file picker.
- A queue with track removal and search by title, artist, album, or filename.
- Embedded track information and cover art, with filenames as a fallback.
- Playback seeking, volume control, shuffle, and repeat modes.
- Saved queue, selected track, playback position, and player settings.
- Keyboard shortcuts and system media controls where supported.
- Window size and position restoration, plus a compact layout for smaller windows.

## What's planned

- **Jam sessions** — listen together with friends in shared listening sessions.
- **Equalizer** — adjust your sound and save your favourite presets.
- **Listening stats** — explore your most played tracks, favourite artists, and listening history.
- **Themes** — choose different visual styles and make the player feel like yours.
- **Playlists and library tools** — give your collection more structure and make the next track easier to find.
- **Android and Linux** — bring Kitto to more of the devices you use.

These are plans for future development. The current thing is getting the core player right.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Space` | Play or pause. |
| `Ctrl+Right` / `Ctrl+Left` | Next or previous track. |
| `Right` / `Left` | Seek forward or backward by 5 seconds. |
| `Up` / `Down` | Increase or decrease volume by 5%. |


## Built with

Svelte 5, TypeScript, Vite, and Tauri 2, with Rust for the native application shell and `music-metadata` for audio tags.
