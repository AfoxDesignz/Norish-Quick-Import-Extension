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
