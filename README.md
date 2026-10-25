# Kito · Orbit

A small learning project for a local music player, built with **Svelte 5, TypeScript, Vite, and Tauri 2**.

The Orbit screen has an orange disc, a local audio file picker, and a Play/Pause button. Selecting a file displays its name. Playback errors appear on screen, and the button returns to Play when the track ends. Previous and next controls are still disabled. The ring around the disc is decorative.

## Run in the browser

Open PowerShell in the project folder. Use Node.js 22.12+ on the 22.x release line, or a newer supported LTS release.

Install dependencies once. This downloads packages into `node_modules`:

```powershell
npm install
```

Start the development server:

```powershell
npm run dev
```

Open **http://localhost:1420**. Code changes appear automatically. Press `Ctrl+C` to stop the server. You can work on the interface in this mode before installing Rust.

## Run as a Windows app

Tauri requires **Rust with the MSVC toolchain**, **Microsoft C++ Build Tools** with the "Desktop development with C++" workload, and the **WebView2 Runtime**. When this starter was created, Tauri detected WebView2 on this machine but could not find Rust/Cargo or the required C++ Build Tools. The native build has not been verified yet.

Follow the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/#windows), then open a new terminal. Stop any running browser development server first: Tauri starts Vite on the same port.

```powershell
npm run tauri dev
```

The first launch compiles Rust and may take longer. Once the tools are installed, build the Windows app and installer with:

```powershell
npm run tauri build
```

## Project structure

```text
src/
  main.ts
  App.svelte
  app.css
  lib/audio.ts
  lib/types.ts
  lib/components/OrbitPlayer.svelte
public/kito.svg
src-tauri/
```

A Svelte component contains the markup and behavior for part of the screen. TypeScript describes data and helps catch errors. Vite runs the development server and builds the interface. Tauri opens it in the system WebView as a standalone app.

The interface reads its name from `productName` in `src-tauri/tauri.conf.json`. To rename the app, update `productName` and `app.windows[0].title` there, then restart it. The npm and Cargo package names can stay as they are.

The app icons in `src-tauri/icons` are also generated from the SVG logo.

## Checks

Check Svelte, TypeScript, and the Vite configuration:

```powershell
npm run check
```

Build the production interface into `dist`:

```powershell
npm run build
```

Preview the production build locally:

```powershell
npm run preview
```

The screen uses a system font and a local logo, so it needs no remote assets. Development and build dependencies must be downloaded first. The `node_modules`, `dist`, and Rust `target` folders are excluded from Git.

## Next steps

Continue in **guided-coding** mode: you write each change and run the commands, while the mentor explains small steps and reviews the results you share.

The `Track` type holds an ID and a title. Audio loading, playback, pause, and end events live in `src/lib/audio.ts`, separate from the Svelte component. Files are selected for the current session; the library is not saved yet.

Next, install the Windows build tools and Rust to test the Tauri desktop app. Queue controls, seeking, volume, and a persistent library are later steps.

Linux testing and Android support come later. Background playback on Android requires a native audio service with system media controls. That integration, storage, and device synchronization are left for future steps.
