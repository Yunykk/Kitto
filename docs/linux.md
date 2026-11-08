# Linux

Kitto uses its native Tauri desktop shell on Linux, with GTK 3, WebKitGTK 4.1 and GStreamer. The Linux build produces AppImage, DEB and RPM packages for the architecture of the build machine. The CI target is x86_64, built on Ubuntu 22.04. Android remains a separate, unfinished port.

## Install

Download a Linux asset from [Releases](https://github.com/Yunykk/Kitto/releases) when one is available. Otherwise build from source or download the `Kitto-linux-x64` artifact from a successful Linux workflow run in GitHub Actions. Workflow artifacts contain packages but are not published releases.

On Ubuntu/Debian, install the DEB with dependencies:

```bash
sudo apt install ./Kitto_*.deb
kitto
```

On Fedora, install the RPM:

```bash
sudo dnf install ./Kitto-*.rpm
kitto
```

Use the exact downloaded filename if its capitalization differs. The application also appears in your desktop's application menu.

For AppImage:

```bash
chmod +x ./Kitto_*.AppImage
./Kitto_*.AppImage
```

If FUSE is unavailable, run the exact filename with `--appimage-extract-and-run`, for example `./Kitto_0.2.0_amd64.AppImage --appimage-extract-and-run`. AppImages include additional GStreamer libraries for multimedia; they still require a compatible Linux desktop and glibc. They are not universal across every distribution or older glibc releases.

## Build from source

Install Node.js 22.12 or newer and stable Rust using [rustup](https://rustup.rs/). Use Linux binaries, including inside WSL; Windows Node.js, `node_modules` and Rust cannot be reused for a Linux build.

Ubuntu 22.04/24.04 or Debian 12/13:

```bash
sudo apt update
sudo apt install build-essential curl pkg-config libwebkit2gtk-4.1-dev libssl-dev librsvg2-dev patchelf libgstreamer1.0-dev gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-libav rpm
```

Fedora:

```bash
sudo dnf install gcc gcc-c++ make curl pkgconf-pkg-config webkit2gtk4.1-devel openssl-devel librsvg2-devel patchelf gstreamer1-devel gstreamer1-plugins-base gstreamer1-plugins-good gstreamer1-plugins-bad-free rpm-build
```

Then, from your Linux checkout:

```bash
npm ci
npm run linux:check
npm run check
npm test
npm run linux:dev
```

Close the development app before building packages:

```bash
npm run linux:build -- --ci
```

Outputs are in `src-tauri/target/release/bundle/{deb,rpm,appimage}/`. To build just one format: `npm run linux:build -- --bundles deb --ci`. Existing `npm run tauri dev` and `npm run tauri build` commands also load `tauri.linux.conf.json` automatically on Linux.

Build release packages on the oldest distribution you intend to support. A binary built locally on Ubuntu 24.04 may require newer glibc than the Ubuntu 22.04 CI build. ARM64 requires a native ARM64 build environment and is not covered by the x64 workflow.

## Audio and desktop behavior

Use **Add music** to grant access to local files through the native picker. Access is restored between launches. Keep imported files in place; Windows library paths are not portable to Linux. Linux paths are case-sensitive, and Unicode, spaces, `#`, `%` and literal backslashes in filenames are preserved.

WAV, FLAC, MP3, Ogg/Vorbis and Opus playback depends on installed GStreamer decoders. AAC/M4A availability varies with distribution codec policy. Debian/Ubuntu packages depend on the libav plugin; Fedora users may need additional codec packages from their chosen repositories. A filename extension alone does not guarantee that the encoded audio is supported. The equalizer uses Web Audio in WebKitGTK.

Linux audio uses an app-owned HTTP stream bound only to `127.0.0.1` on a random port, because GStreamer cannot reliably play Tauri's custom `asset://` scheme. Native commands verify the file against the same picker-granted asset scope before issuing a random stream token. The server supports byte ranges for seeking, reads files incrementally, and never accepts arbitrary filesystem paths in URLs. Tokens are released on track changes and cleared on page reload. Metadata and artwork continue to use Tauri's asset protocol. There is no external server or upload.

Both X11 and Wayland use the same application. Window positioning is controlled by the compositor on Wayland, so restoring an exact position is not guaranteed. System media actions are enabled when the webview exposes Media Session; Kitto does not currently implement a separate native MPRIS service.

For an AppImage FUSE error, use extraction mode above. For graphics startup issues, see [Tauri's Linux graphics guide](https://v2.tauri.app/develop/debug/linux-graphics/). Do not disable the WebKit sandbox as a routine fix. In a headless session, a display server and D-Bus session are required; normal desktop users already have both.

## Automated native smoke test

The Linux workflow runs checks, JavaScript and Rust tests, a real native window under Xvfb/WebKitWebDriver, and all three package builds. The smoke test uses the actual GTK file picker to import generated files with normal application permissions. It checks file scope restrictions, byte ranges, seeking, six audio formats, actual output on an isolated PulseAudio sink, the equalizer, settings, collection menus, and 36 theme/layout combinations. It restarts the app to check that the library and granted file access survive a full restart. The packaged AppImage runs through the same test after bundling.

To reproduce the smoke stage on Ubuntu:

```bash
sudo apt install webkit2gtk-driver xvfb xauth xdotool xclip dbus-x11
cargo install tauri-driver --locked
npm run linux:build -- --debug --no-bundle --ci
GDK_BACKEND=x11 KITTO_TEST_NATIVE_PICKER=1 dbus-run-session -- xvfb-run -a node scripts/linux-smoke.mjs
```

The smoke test creates an isolated temporary XDG profile and generated test tracks; it does not replace your normal library. Set `KITTO_TEST_CODECS=1` to also generate MP3, FLAC, Vorbis, Opus and AAC/M4A fixtures; this needs `gstreamer1.0-tools` and the encoder plugins installed by CI. Set `KITTO_AUDIO_MONITOR` to an isolated PulseAudio test sink's monitor to verify nonzero audio output. The workflow creates this sink itself; do not use a microphone or your normal desktop audio monitor for this test.

Tests do not prove every distribution, desktop compositor or audio device works; a physical Linux desktop check remains part of release review. Local verification on 2026-11-03 used Ubuntu 24.04 under WSL, WebKitGTK 2.52.6, GStreamer 1.24.2, X11/Xvfb and WSLg Wayland. The release binary and packaged AppImage passed native playback tests; DEB and RPM package metadata was inspected. Fedora installation has not been tested. The Ubuntu 22.04 GitHub workflow must run successfully before its packages are described as verified on that baseline.
