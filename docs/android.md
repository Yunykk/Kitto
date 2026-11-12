# Android

Kitto's Android target shares the Svelte interface with desktop and uses a native Android audio service. Android document access and playback are implemented in the in-repository Tauri plugin at `src-tauri/plugins/android-audio`. Windows and Linux keep their existing audio backends.

## Native behavior

- **Add music** opens Android's Storage Access Framework document picker (`ACTION_OPEN_DOCUMENT`). Multiple audio documents can be selected. The library stores each provider URI and display name, with a persistable read grant instead of guessing a filesystem path.
- Metadata and bounded album-art thumbnails are read natively through the granted document URI. Android imports do not use the desktop `asset://` protocol.
- Media3 ExoPlayer and its complete playback queue live inside a `MediaSessionService`, independent of the WebView. This supplies media notifications, lock-screen/headset controls, audio-focus handling and playback while the activity is backgrounded. Queue transitions, shuffle and repeat are handled by the native player.
- The native queue, position, volume, equalizer and tuning settings are saved periodically. A process restart restores paused playback; returning to an activity while its service is already playing keeps that service's current state.
- Tuning changes the A4 reference from 440 Hz to 396, 432, 528, 639, 741 or 852 Hz using Media3's independent pitch processing at speed 1. Original restores the unshifted signal. This transposes the whole recording; it does not detect the recording's original tuning.
- The Android equalizer maps the ten interface bands to the native device's available band frequencies. Native effect availability and band count depend on the device; the desktop Web Audio equalizer is separate.
- Back first dismisses a menu/dialog and then navigates out of a nested library view. At the root it saves interface state and moves the activity to the background, allowing current music to continue. Use Pause or the system media controls to stop playback.
- Mobile layouts include safe-area padding, touch controls, internal scrolling and landscape support. Desktop-only window operations are skipped on Android.

The manifest requests foreground media-playback service and wake-lock permissions. It does not request broad storage access: only documents selected by the user are read. Removing the app's storage data clears its library and document permissions. A provider can revoke access or remove a file; select that file again if its grant is no longer valid.

Android codec support depends on the device, Android version and actual encoding. Test the files you intend to use; a filename extension alone does not guarantee decoder support. Cloud document providers may need a network connection before a selected file is available.

Source implementation, an APK build and a device test are separate verification stages. Browser simulations cannot establish that a service survives screen-off on a particular Android device. A signed APK can be installed directly; Play Store publication remains a separate step.

## Local prerequisites

Install Android Studio, then use its SDK Manager to install an Android SDK Platform, SDK Platform-Tools, SDK Build-Tools, Command-line Tools and **NDK (Side by side)**. Accept the SDK licenses in Android Studio or with `sdkmanager --licenses`.

Install Rust through rustup and add the phone target:

```bash
rustup target add aarch64-linux-android
```

From the Kitto directory:

```bash
npm ci
npm run android:check
```

The check locates Android Studio's bundled Java runtime and installed NDK when possible. Explicit `JAVA_HOME`, `ANDROID_HOME` / `ANDROID_SDK_ROOT`, `NDK_HOME` and `CARGO_HOME` values are respected. Detected variables are passed only to the child build process; user/system environment settings are not changed.

If Java is not found, point `JAVA_HOME` at Android Studio's `jbr` directory. If the SDK or NDK is not found, set `ANDROID_HOME` and `NDK_HOME` to their actual directories. Use JDK 17 or later; the preview workflow uses JDK 21.

NDK packages and native build caches need several gigabytes. Check free disk space before installing them. Keep the Windows release installer separately from disposable build caches.

To keep Android caches on another drive, copy `android.local.example.json` to `android.local.json` in the project root and replace the example paths with your own. The local file is ignored by Git. Its values apply only to Android commands. Explicit tool/cache environment variables take precedence; configured `TMP`/`TEMP` replace the system temp paths only in the Android child process. Windows/Linux builds keep their own target directories. The wrapper creates configured cache/temp directories when a build starts. On this workstation the NDK, Gradle cache and Android Rust target are on E:.

The checked-in Android Gradle project compiles against SDK Platform 36, so install that platform and Build-Tools 36 in SDK Manager.

## Initialize and run

Once `android:check` succeeds:

```bash
npm run android:init
npm run android:dev
```

The official Tauri Android project is checked in at `src-tauri/gen/android`. The init command creates it only if absent and preserves existing Gradle configuration and icons. The local Android audio plugin is included through Cargo/Tauri and its library manifest is merged into the app; do not manually copy its Kotlin files into generated sources. Connect a phone with USB debugging enabled, or start an emulator.

For a typical x86_64 emulator, install its Rust target too:

```bash
rustup target add x86_64-linux-android
```

Tauri starts the frontend server for development. Stop a separate Vite instance using port 1420 first. Use the address supplied through `TAURI_DEV_HOST` for a physical device; a phone's `localhost` is not the development computer.

## Build a local debug APK

```bash
npm run android:build -- --debug --apk --ci
```

The wrapper defaults to ARM64 instead of compiling every Android ABI. For an emulator build:

```bash
npm run android:build -- --target x86_64 --debug --apk --ci
```

APKs are written below `src-tauri/gen/android/app/build/outputs/apk/`. Debug signing is for local testing; production signing and publishing are a later step.

After the first APK build, run `npm run android:test` for native audio processing tests. They render a known 440 Hz PCM signal through Media3's Sonic processor and check the resulting frequency and duration for each tuning preset, as well as Original bypass. These tests complement `npm test`; they do not need a connected device.

Run `npm run android:verify` to check the built APK's signature, ZIP alignment and every ARM64/x86_64 native library's 16 KiB ELF alignment. You can supply another APK path after `--`. Linker settings in `src-tauri/build.rs` enable 16 KiB alignment with NDK r27; this is required for modern devices using larger memory pages. Passing the binary checks is separate from running on a physical 16 KiB device.

Gradle uses a 1 GiB heap and two workers, with Kotlin compilation in the same process. On a machine with limited RAM, finish the APK build before starting an emulator. Idle Gradle daemons can be stopped with `gradlew --stop` from the Android project directory (`gradlew.bat` on Windows).

## Build a signed release APK

With the prerequisites installed, run:

```bash
npm run check
npm test
npm run android:release
```

This builds an ARM64 release, aligns it for 16 KiB memory pages, signs it, verifies the signature and native libraries, and writes `build/android/Kitto_0.2.0_android-arm64.apk` plus a SHA-256 checksum. Upload the APK and checksum to GitHub Releases. The release embeds the interface and does not need Vite or a development computer to run.

On the first run, the command creates a private signing identity in `~/.kitto/android-signing/` (on Windows, `%USERPROFILE%\.kitto\android-signing\`). **Back up that entire directory privately, including `release.p12` and `credentials.json`.** Later updates must use the same key. Do not upload these files or commit them. `KITTO_SIGNING_DIR` can point to an existing signing directory on another machine. Losing the key prevents publishing compatible updates to installations signed with it.

If a release APK has already been built, `npm run android:release -- --sign-only` signs the existing release without recompiling. Do not use this option after source changes until the release has been rebuilt.

The signed release uses a different certificate from a debug preview. Android cannot install it over the preview: uninstall the debug version first, which clears its saved library and settings. Future release APKs signed with the same release key can update the installed release normally. Android 7.0 (API 24) or newer and an ARM64 device are required.

## Build without using local NDK space

After committing and pushing these changes, open **Actions → Android preview → Run workflow** in GitHub. The workflow installs its tools on the runner, initializes the Android project, runs frontend checks/tests and attempts an ARM64 debug APK build. Download the `Kitto-android-arm64-preview` artifact after a successful run.

The workflow is manual and does not publish a release. Only a successful workflow run confirms that its APK was built. Installing that APK on a device is still required for native playback acceptance.

## Device acceptance checks

- Launch, rotate and resize without clipping transport controls or system bars.
- Back closes nested dialogs/menus before leaving the current view.
- Import several real MP3/FLAC/WAV documents, including Unicode names, and cancel the picker without changing the library. Importing the same document again must reuse its library entry.
- Play, pause, seek, change the volume, select a different track, shuffle and repeat. Confirm actual audible output and matching progress.
- Read tags and embedded artwork; a missing cover or unsupported metadata must not break playback.
- Press Home or root Back, lock the screen, and let more than one queued track finish. Verify continuous playback and Next/Previous/Pause on the lock screen and notification.
- Return to the app and verify that its title, progress, queue and playback state agree with the native service.
- Disconnect headphones, trigger an audio-focus interruption and reconnect Bluetooth audio. Playback should follow Android's focus/noisy-audio behavior without two audio engines playing at once.
- Restart the activity, then force-stop and reopen the app, then reboot the device. The library and document access should persist; a new process must restore paused, while an already running service keeps playing.
- Remove an imported document or revoke access through its provider. A later attempt must show an error without deleting unrelated library entries.
- Exercise the equalizer, presets and automatic preamp on the target device. Check for clipping at high gains and confirm that disabling the effect restores the unmodified signal.

Use an up-to-date Android System WebView for device testing. CSS safe-area handling depends on WebView support and native window configuration; the simulated inset tests do not prove every device's system bars are handled correctly.

References: [Tauri Android prerequisites](https://v2.tauri.app/start/prerequisites/#android), [Tauri mobile plugins](https://v2.tauri.app/develop/plugins/develop-mobile/), [Android document access](https://developer.android.com/training/data-storage/shared/documents-files), [Media3 background playback](https://developer.android.com/media/media3/session/background-playback), [Android WebView window insets](https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets).
