import { onBackButtonPress } from "@tauri-apps/api/app";
import { runtimePlatform } from "./runtime";
import { androidRequest } from "./android-bridge";

export function dismissTopLayer(doc: Document): boolean {
  const popovers = [...doc.querySelectorAll<HTMLElement>("[popover]")].filter((element) => {
    try { return element.matches(":popover-open"); } catch { return false; }
  });
  const popover = popovers.at(-1);
  if (popover) { popover.hidePopover(); return true; }
  const focused = doc.activeElement?.closest<HTMLDialogElement>("dialog[open]");
  const dialog = focused ?? [...doc.querySelectorAll<HTMLDialogElement>("dialog[open]")].at(-1);
  if (!dialog) return false;
  const CancelEvent = doc.defaultView?.Event ?? Event;
  if (dialog.dispatchEvent(new CancelEvent("cancel", { cancelable: true }))) dialog.close();
  return true;
}

export function registerAndroidBack(actions: { navigate: () => boolean; beforeExit: () => void }) {
  if (runtimePlatform() !== "android") return () => {};
  let disposed = false;
  let unregister: (() => Promise<void>) | undefined;
  void onBackButtonPress(({ canGoBack }) => {
    if (disposed || dismissTopLayer(document) || actions.navigate()) return;
    if (canGoBack) window.history.back();
    else {
      actions.beforeExit();
      void androidRequest("background").catch((error) => console.warn("Could not move Kitto to the background.", error));
    }
  }).then((listener) => {
    if (disposed) void listener.unregister().catch(() => {});
    else unregister = () => listener.unregister();
  }).catch((error) => console.warn("Could not register Android Back.", error));
  return () => {
    if (disposed) return;
    disposed = true;
    void unregister?.().catch(() => {});
  };
}
