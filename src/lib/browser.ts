import { IS_EXTENSION_ENV } from "./polyfill-guard";
import browser, { type Storage, type Tabs } from "webextension-polyfill";

export { browser };

export function isExtensionContextValid(): boolean {
  try {
    return (
      IS_EXTENSION_ENV &&
      typeof browser !== "undefined" &&
      Boolean(browser.runtime?.id)
    );
  } catch {
    return false;
  }
}

export async function getActiveTab(): Promise<Tabs.Tab | undefined> {
  if (!isExtensionContextValid()) return undefined;

  try {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tabs[0];
  } catch {
    return undefined;
  }
}

export async function requestHostPermission(origins: string[]): Promise<void> {
  if (!origins.length) return;

  const granted = await browser.permissions.request({ origins });
  if (!granted) {
    throw new Error(
      "Host permission was denied. Please allow access for your Norish domain.",
    );
  }
}

export function onStorageChanged(
  listener: (
    changes: Record<string, Storage.StorageChange>,
    areaName: string,
  ) => void,
): () => void {
  if (!isExtensionContextValid()) {
    return () => undefined;
  }

  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

export type ActionBadgeState = "success" | "error" | "clear";

function getThemeColor(
  variableName: "--success" | "--danger",
  fallback: string,
): string {
  try {
    if (typeof document === "undefined") return fallback;
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(variableName)
      .trim();
    return value || fallback;
  } catch {
    return fallback;
  }
}

export function setActionBadge(state: ActionBadgeState): void {
  if (!isExtensionContextValid()) return;

  if (state === "clear") {
    void browser.action.setBadgeText({ text: "" });
    return;
  }

  void browser.action.setBadgeText({ text: "●" });
  void browser.action.setBadgeBackgroundColor({
    color:
      state === "success"
        ? getThemeColor("--success", "#366943")
        : getThemeColor("--danger", "#ef5350"),
  });
}
