import { getChromeRuntimeError, setActionBadge } from "./lib/chrome";
import type { StoredConfig } from "./types/storage";
import { isImportInProgress, type StoredImport } from "./types/importStatus";
import {
  createNorishClient,
  extractErrorMessage,
  getRecipeStatus,
  normalizeToDomain,
} from "./lib/api";

const IMPORT_STATUS_SYNC_ALARM = "norish-import-monitor";
const IMPORT_STATUS_POLL_INTERVAL_MINUTES = 1;
const POLL_INTERVAL_MS = 2000; // Poll every 2 seconds
const POLL_TIMEOUT_MS = 3 * 60 * 1000; // 3 minute safety timeout for long running parser jobs

function syncBadgeWithImportStatus(lastImport: StoredImport | undefined): void {
  if (lastImport?.status === "success") {
    setActionBadge("success");
    return;
  }

  if (lastImport?.status === "error") {
    setActionBadge("error");
    return;
  }

  setActionBadge("clear");
}

function storageGet<T>(
  area: chrome.storage.StorageArea,
  keys: string[],
): Promise<T> {
  return new Promise((resolve, reject) => {
    area.get(keys, (result) => {
      const runtimeError = getChromeRuntimeError();
      if (runtimeError) {
        reject(new Error(runtimeError));
        return;
      }
      resolve(result as T);
    });
  });
}

function storageSet(
  area: chrome.storage.StorageArea,
  values: Record<string, unknown>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    area.set(values, () => {
      const runtimeError = getChromeRuntimeError();
      if (runtimeError) {
        reject(new Error(runtimeError));
        return;
      }
      resolve();
    });
  });
}

function storageRemove(
  area: chrome.storage.StorageArea,
  key: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    area.remove(key, () => {
      const runtimeError = getChromeRuntimeError();
      if (runtimeError) {
        reject(new Error(runtimeError));
        return;
      }
      resolve();
    });
  });
}

async function getLastImport(): Promise<StoredImport | undefined> {
  const result = await storageGet<{ lastImport?: StoredImport }>(
    chrome.storage.local,
    ["lastImport"],
  );
  return result.lastImport;
}

async function getConfig(): Promise<StoredConfig> {
  return storageGet<StoredConfig>(chrome.storage.sync, [
    "instanceDomain",
    "apiKey",
  ]);
}

async function persistLastImport(next: StoredImport | null): Promise<void> {
  if (!next) {
    await storageRemove(chrome.storage.local, "lastImport");
    setActionBadge("clear");
    return;
  }

  await storageSet(chrome.storage.local, {
    lastImport: {
      ...next,
      timestamp: Date.now(),
    },
  });
  syncBadgeWithImportStatus(next);
}

async function syncImportMonitorAlarm(): Promise<void> {
  const lastImport = await getLastImport();
  if (isImportInProgress(lastImport)) {
    chrome.alarms.create(IMPORT_STATUS_SYNC_ALARM, {
      periodInMinutes: IMPORT_STATUS_POLL_INTERVAL_MINUTES,
    });
    return;
  }

  await chrome.alarms.clear(IMPORT_STATUS_SYNC_ALARM);
}

function isTerminalMonitorError(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return false;

  // Treat authentication/authorization issues as terminal.
  return (
    normalized.includes("invalid api key") ||
    normalized.includes("you must be logged in")
  );
}

/**
 * Poll for recipe status until it appears or timeout occurs
 * @param baseUrl API base URL
 * @param apiKey API key
 * @param recipeId Recipe UUID to poll for
 * @returns true if recipe found (success), false if timeout/error
 */
async function pollRecipeStatus(
  baseUrl: string,
  apiKey: string,
  recipeId: string,
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    try {
      const recipe = await getRecipeStatus(baseUrl, apiKey, recipeId);

      if (recipe) {
        // Recipe found = success
        return true;
      }

      // 404 = still parsing, continue polling
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    } catch (error) {
      const message = extractErrorMessage(error);
      // Terminal errors should stop polling immediately
      if (isTerminalMonitorError(message)) {
        throw error;
      }
      // Temporary errors, retry
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  // Timeout reached without finding recipe
  return false;
}

let isSyncing = false;

async function syncImportStatusInBackground(): Promise<void> {
  if (isSyncing) return;

  const lastImport = await getLastImport();
  if (!lastImport || !isImportInProgress(lastImport)) {
    syncBadgeWithImportStatus(lastImport);
    await syncImportMonitorAlarm();
    return;
  }

  isSyncing = true;
  try {
    const recipeId = lastImport.recipeId;
    if (!recipeId) {
      await syncImportMonitorAlarm();
      return;
    }

    const config = await getConfig();
    const domain = normalizeToDomain(config.instanceDomain);
    if (!domain || !config.apiKey) {
      await syncImportMonitorAlarm();
      return;
    }

    let baseUrl: string;
    let apiKey: string;
    try {
      const apiConfig = await createNorishClient({
        instanceDomain: config.instanceDomain as string,
        apiKey: config.apiKey as string,
      } as Required<StoredConfig>);
      baseUrl = apiConfig.baseUrl;
      apiKey = apiConfig.apiKey;
    } catch {
      await syncImportMonitorAlarm();
      return;
    }

    // Update status to "parsing" while checking
    if (lastImport.status !== "parsing") {
      await persistLastImport({
        status: "parsing",
        recipeId,
        message: "Norish is processing your recipe.",
      });
    }

    try {
      const found = await pollRecipeStatus(baseUrl, apiKey, recipeId);

      if (found) {
        await persistLastImport({
          status: "success",
          recipeId,
        });
      } else {
        // Timeout without finding recipe
        await persistLastImport({
          status: "error",
          recipeId,
          message: "Recipe import timed out. Please try again.",
        });
      }
    } catch (error) {
      const message = extractErrorMessage(error);
      await persistLastImport({
        status: "error",
        recipeId,
        message,
      });
    }

    await syncImportMonitorAlarm();
  } finally {
    isSyncing = false;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void syncImportMonitorAlarm();
  void syncImportStatusInBackground();
});

chrome.runtime.onStartup.addListener(() => {
  void syncImportMonitorAlarm();
  void syncImportStatusInBackground();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && typeof message === "object" && "type" in message) {
    if (message.type === "monitor-import-now") {
      void syncImportStatusInBackground();
    }
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" && areaName !== "sync") return;
  if (changes.lastImport || changes.instanceDomain || changes.apiKey) {
    void syncImportMonitorAlarm();
    void syncImportStatusInBackground();
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== IMPORT_STATUS_SYNC_ALARM) return;
  void syncImportStatusInBackground();
});
