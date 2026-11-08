<p align="center">
  <img src="public/kitto.svg" alt="Kitto" width="64" height="64" />
</p>

<h1 align="center">Kitto</h1>

<p align="center"><strong>i got tired of spotify</strong></p>

Kitto is a local music player for your own collection, with a clean interface and a warm visual style. Play your files, organize your queue, find tracks by name, artist, or album, and return to where you left off.

The goal is to keep everyday listening simple while gradually adding more ways to shape your sound, explore your listening habits, and share music with others.

**Kitto is in early development, with Windows and Linux desktop builds and an Android preview.**

## Download and run

1. Open [GitHub Releases](https://github.com/Yunykk/Kitto/releases).
2. Download the Windows x64 installer from the release assets, such as `Kitto_0.2.0_x64-setup.exe`.
3. Run the installer, then open **Kitto** from the Start menu.

No account is required. Music is not bundled with the app; use your own local audio files.

On Linux, use a DEB, RPM or AppImage asset when available. DEB: `sudo apt install ./Kitto_*.deb`; RPM: `sudo dnf install ./Kitto-*.rpm`; AppImage: make the downloaded file executable and open it. See [Linux installation, codecs and troubleshooting](docs/linux.md).

On Android, install an ARM64 APK when available in the release assets. Allow installation from the app used to open it, then launch **Kitto** and tap **Add music**. Android grants access only to the documents you select. A debug APK is a local preview, not a Play Store release.

## How to use it

1. Click **Add music** and select audio files from your computer.
2. Choose a track in **Music**, then use the playback buttons to play, pause, or change tracks.
3. Drag the playback slider to seek. Adjust volume, shuffle, and repeat beside the controls.
4. Use **Playlists** to organize tracks, or click a track's heart to add it to **Liked songs**.
5. Open **Albums** in the library to browse tagged albums in disc/track order.
6. Open **EQ** beside the volume control to adjust the equalizer, **Stats** to view listening activity, or **Settings** to change the theme, accent color and tuning.

Your library and player settings are saved locally. Kitto remembers file locations, so keep imported files in place. Listening statistics start accumulating when you use the app.

## Run from source

For Windows desktop development, install:

- Node.js and npm.
- Rust through [rustup](https://rustup.rs/), using the MSVC toolchain.
- Visual Studio Build Tools 2022 with **Desktop development with C++**, including MSVC and a Windows SDK.
- Microsoft Edge WebView2 Runtime.

From a terminal:

```bash
git clone https://github.com/Yunykk/Kitto.git
cd Kitto
npm install
npm run tauri dev
```

This opens Kitto as a desktop app. The first native compilation can take several minutes. Tauri starts Vite automatically; stop any separate `npm run dev` process first so port `1420` is available.

For a browser-only UI preview, run `npm run dev` and open the address printed in the terminal. Native file import requires the Kitto application.

## Build a Windows installer

With the same prerequisites installed, run these commands from the project directory:

```bash
npm run check
npm test
npm run tauri build -- --bundles nsis
```

The installer is written to `src-tauri/target/release/bundle/nsis/`. For version 0.2.0, the file is `Kitto_0.2.0_x64-setup.exe`.

## Build on Linux

Install Linux Node.js 22.12+, stable Rust, GTK 3/WebKitGTK 4.1 development libraries and GStreamer as described in [Linux setup](docs/linux.md). Then run:

```bash
npm ci
npm run linux:check
npm run check
npm test
npm run linux:dev
```

To create AppImage, DEB and RPM packages, close the development app and run `npm run linux:build -- --ci`. Packages are written to `src-tauri/target/release/bundle/`. Linux CI builds on Ubuntu 22.04 and runs a native WebKitGTK smoke test before packaging; workflow artifacts are available after a successful run. Windows cannot build Linux packages directly.

## What works now

Android uses native document import and a Media3 foreground playback service, including persistent file access and lock-screen controls. See [Android setup, APK builds and validation](docs/android.md).

- Local audio playback with a native file picker.
- A queue with track removal and search by title, artist, album, or filename.
- Embedded track information and cover art, with filenames as a fallback.
- Playback seeking, volume control, shuffle, and repeat modes.
- Saved queue, selected track, playback position, and player settings.
- Keyboard shortcuts and system media controls where supported.
- Window size and position restoration, plus a compact layout for smaller windows.
- Playlists, liked songs, and four collection views with sorting.
- Albums grouped by album artist, with disc headings and track numbers.
- Six player themes, dark mode, and custom accent colors.
- A 10-band equalizer with presets, preamp controls, and saved settings.
- Saved tuning presets for A4 at 396, 432, 528, 639, 741 and 852 Hz, with pitch processing that keeps the tempo unchanged. Original bypasses the pitch shift. Recordings are assumed to use A4 = 440 Hz; their original reference is not detected automatically.
- Listening history, top tracks and artists, and daily listening activity.

## What's planned

- **Jam sessions** — listen together with friends in shared listening sessions.
- **Android distribution** — expand physical-device testing and prepare production signing and store publication.

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

Desktop pitch processing uses SoundTouchJS; Android playback and pitch processing use AndroidX Media3. See [audio processing notices](public/THIRD_PARTY_NOTICES.txt).
