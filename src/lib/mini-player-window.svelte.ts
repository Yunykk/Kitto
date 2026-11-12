import { onMount } from "svelte";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isDesktopRuntime } from "./runtime";

const RECOVERY_KEY = "kitto.mini.restore.v1";

const FULL_MIN = new LogicalSize(360, 560);
const MINI_MIN = new LogicalSize(280, 240);

type WindowSnapshot = {
  width: number;
  height: number;
  maximized: boolean;
  fullscreen: boolean;
  pinned: boolean;
};

function errorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "string") return cause;

  return fallback;
}

function readRecovery(): WindowSnapshot | null {
  const raw = localStorage.getItem(RECOVERY_KEY);

  if (raw === null) return null;

  const value = JSON.parse(raw) as Partial<WindowSnapshot> & {
    version?: number;
  };

  if (
    !value ||
    value.version !== 1 ||
    typeof value.width !== "number" ||
    !Number.isFinite(value.width) ||
    value.width <= 0 ||
    value.width > 16_384 ||
    typeof value.height !== "number" ||
    !Number.isFinite(value.height) ||
    value.height <= 0 ||
    value.height > 16_384 ||
    typeof value.maximized !== "boolean" ||
    typeof value.fullscreen !== "boolean" ||
    typeof value.pinned !== "boolean"
  ) {
    throw new Error("Could not read the saved window size.");
  }

  return {
    width: value.width,
    height: value.height,
    maximized: value.maximized,
    fullscreen: value.fullscreen,
    pinned: value.pinned,
  };
}

export function createMiniPlayerWindow() {
  const supported = isDesktopRuntime();

  let isReady = $state(false);
  let isMini = $state(false);
  let isBusy = $state(false);
  let isPinned = $state(true);
  let error = $state("");

  let previous: WindowSnapshot | null = null;
  let miniSize = { width: 360, height: 440 };
  let disposed = false;

  function remember(snapshot: WindowSnapshot): void {
    try {
      localStorage.setItem(
        RECOVERY_KEY,
        JSON.stringify({ version: 1, ...snapshot }),
      );
    } catch {
      throw new Error("Could not save the full player window size");
    }
  }

  function forgetRecovery(): void {
    try {
      localStorage.removeItem(RECOVERY_KEY);
    } catch {
      error = "Window restored, but its saved state could not be cleared";
    }
  }

  async function readSize() {
    const appWindow = getCurrentWindow();

    const [size, factor] = await Promise.all([
      appWindow.innerSize(),
      appWindow.scaleFactor(),
    ]);

    return {
      width: size.width / factor,
      height: size.height / factor,
    };
  }

  async function restore(snapshot: WindowSnapshot): Promise<void> {
    const appWindow = getCurrentWindow();

    if (await appWindow.isFullscreen()) {
      await appWindow.setFullscreen(false);
    }

    if (await appWindow.isMaximized()) {
      await appWindow.unmaximize();
    }

    await appWindow.setMinSize(FULL_MIN);

    await appWindow.setSize(
      new LogicalSize(
        Math.max(FULL_MIN.width, snapshot.width),
        Math.max(FULL_MIN.height, snapshot.height),
      ),
    );

    await appWindow.setAlwaysOnTop(snapshot.pinned);

    if (snapshot.maximized) {
      await appWindow.maximize();
    }

    if (snapshot.fullscreen) {
      await appWindow.setFullscreen(true);
    }
  }

  async function initialize(): Promise<void> {
    if (!supported) {
      isReady = true;
      return;
    }

    try {
      const saved = readRecovery();

      if (saved) {
        previous = saved;

        await restore(saved);

        previous = null;
        forgetRecovery();
      }
    } catch (cause) {
      error = errorMessage(cause, "Could not restore the full player window");
    } finally {
      if (!disposed) isReady = true;
    }
  }

  onMount(() => {
    void initialize();

    return () => {
      disposed = true;
    };
  });

  async function enter(): Promise<boolean> {
    if (!supported || !isReady || isBusy || isMini || disposed) {
      return false;
    }

    isBusy = true;
    error = "";

    try {
      const appWindow = getCurrentWindow();

      const [size, maximized, fullscreen, pinned] = await Promise.all([
        readSize(),
        appWindow.isMaximized(),
        appWindow.isFullscreen(),
        appWindow.isAlwaysOnTop().catch(() => false),
      ]);

      previous = {
        ...size,
        maximized,
        fullscreen,
        pinned,
      };

      remember(previous);

      if (fullscreen) await appWindow.setFullscreen(false);
      if (maximized) await appWindow.unmaximize();

      const normalSize = await readSize();
      previous = { ...previous, ...normalSize };
      remember(previous);

      await appWindow.setMinSize(MINI_MIN);
      await appWindow.setSize(new LogicalSize(miniSize.width, miniSize.height));

      isMini = true;

      try {
        await appWindow.setAlwaysOnTop(isPinned);
      } catch (cause) {
        isPinned = false;

        error = errorMessage(
          cause,
          "Always-on-top is unavailable on this desktop",
        );
      }

      return true;
    } catch (cause) {
      const message = errorMessage(cause, "Could not open the mini player");

      if (previous) {
        try {
          await restore(previous);

          previous = null;
          isMini = false;
          forgetRecovery();
        } catch {
          error = `${message} Could not restore the previous window size`;
          return false;
        }
      }

      error = message;
      return false;
    } finally {
      isBusy = false;
    }
  }

  async function leave(): Promise<boolean> {
    if (!supported || !isReady || isBusy || !isMini || !previous || disposed) {
      return false;
    }

    isBusy = true;
    error = "";

    try {
      const size = await readSize();

      miniSize = {
        width: Math.max(MINI_MIN.width, size.width),
        height: Math.max(MINI_MIN.height, size.height),
      };

      await restore(previous);

      isMini = false;
      previous = null;
      forgetRecovery();

      return true;
    } catch (cause) {
      error = errorMessage(cause, "Could not restore the full player window");

      return false;
    } finally {
      isBusy = false;
    }
  }

  async function togglePin(): Promise<boolean> {
    if (!supported || !isMini || isBusy || disposed) {
      return false;
    }

    isBusy = true;
    error = "";

    try {
      const next = !isPinned;

      await getCurrentWindow().setAlwaysOnTop(next);

      isPinned = next;
      return true;
    } catch (cause) {
      error = errorMessage(cause, "Could not change always-on-top");

      return false;
    } finally {
      isBusy = false;
    }
  }

  return {
    get supported() {
      return supported;
    },
    get isReady() {
      return isReady;
    },
    get isMini() {
      return isMini;
    },
    get isBusy() {
      return isBusy;
    },
    get isPinned() {
      return isPinned;
    },
    get error() {
      return error;
    },
    enter,
    leave,
    togglePin,
  };
}

export type MiniPlayerWindowController = ReturnType<
  typeof createMiniPlayerWindow
>;
