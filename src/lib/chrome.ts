export function isExtensionContextValid(): boolean {
  try {
    return typeof chrome !== "undefined" && !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

export function getChromeRuntimeError(): string | null {
  try {
    return chrome.runtime?.lastError?.message ?? null;
  } catch {
    return null;
  }
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
    chrome.action.setBadgeText({ text: "" });
    return;
  }

  chrome.action.setBadgeText({ text: "●" });
  chrome.action.setBadgeBackgroundColor({
    color:
      state === "success"
        ? getThemeColor("--success", "#366943")
        : getThemeColor("--danger", "#ef5350"),
  });
}
