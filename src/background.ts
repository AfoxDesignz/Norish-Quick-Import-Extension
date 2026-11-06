import { browser, onStorageChanged, setActionBadge } from "./lib/browser";
import type { StoredConfig } from "./types/storage";
import { isImportInProgress, type StoredImport } from "./types/importStatus";
import {
  ApiError,
  createNorishClient,
  extractErrorMessage,
  getImportStatus,
  normalizeToDomain,
} from "./lib/api";
import {
  importFailure,
  jobToStoredImport,
  type ImportContext,
} from "./lib/importJob";

const IMPORT_STATUS_SYNC_ALARM = "norish-import-monitor";
const IMPORT_STATUS_POLL_INTERVAL_MINUTES = 1;
const STATUS_WAIT_SECONDS = 25; // guards against a server that answers immediately instead of waiting.
const MIN_STATUS_CYCLE_MS = 1000;
const STATUS_RETRY_DELAY_MS = 2000;
const MAX_CONSECUTIVE_STATUS_ERRORS = 5;
const WATCH_TIMEOUT_MS = 5 * 60 * 1000; // safety timeout for very long parser jobs

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

async function getLastImport(): Promise<StoredImport | undefined> {
  const result = (await browser.storage.local.get(["lastImport"])) as {
    lastImport?: StoredImport;
  };
  return result.lastImport;
}

async function getConfig(): Promise<StoredConfig> {
  return (await browser.storage.sync.get([
    "instanceDomain",
    "apiKey",
  ])) as StoredConfig;
}

async function persistLastImport(next: StoredImport | null): Promise<void> {
  if (!next) {
    await browser.storage.local.remove("lastImport");
    setActionBadge("clear");
    return;
  }

  await browser.storage.local.set({
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
    browser.alarms.create(IMPORT_STATUS_SYNC_ALARM, {
      periodInMinutes: IMPORT_STATUS_POLL_INTERVAL_MINUTES,
    });
    return;
  }

  await browser.alarms.clear(IMPORT_STATUS_SYNC_ALARM);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Follows an import through the Norish import status API until it completes or fails, reporting progress (waiting / active + step) along the way.
 * @returns the final state to persist, or null when another import replaced this one in the meantime
 */
async function watchImport(
  baseUrl: string,
  apiKey: string,
  context: ImportContext,
  onProgress: (progress: StoredImport) => Promise<void>,
): Promise<StoredImport | null> {
  const startedAt = Date.now();
  let consecutiveErrors = 0;
  let lastReported = "";

  while (Date.now() - startedAt < WATCH_TIMEOUT_MS) {
    const cycleStartedAt = Date.now();

    const current = await getLastImport();
    if (current?.recipeId !== context.recipeId) return null;

    try {
      const job = await getImportStatus(
        baseUrl,
        apiKey,
        context.recipeId,
        STATUS_WAIT_SECONDS,
      );
      consecutiveErrors = 0;

      const next = jobToStoredImport(job, context);
      if (job.status === "completed" || job.status === "failed") {
        return next;
      }

      const progressKey = `${next.status}|${next.message}`;
      if (progressKey !== lastReported) {
        lastReported = progressKey;
        await onProgress(next);
      }
    } catch (error) {
      // Authentication problems will not fix themselves.
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        return importFailure(context, extractErrorMessage(error));
      }

      if (error instanceof ApiError && error.status === 429) {
        consecutiveErrors += 1;
        if (consecutiveErrors >= MAX_CONSECUTIVE_STATUS_ERRORS) {
          return importFailure(context, extractErrorMessage(error));
        }
        await delay(30_000);
        continue;
      }

      consecutiveErrors += 1;
      if (consecutiveErrors >= MAX_CONSECUTIVE_STATUS_ERRORS) {
        return importFailure(context, extractErrorMessage(error));
      }
      await delay(STATUS_RETRY_DELAY_MS);
      continue;
    }

    const elapsed = Date.now() - cycleStartedAt;
    if (elapsed < MIN_STATUS_CYCLE_MS) {
      await delay(MIN_STATUS_CYCLE_MS - elapsed);
    }
  }

  return importFailure(context, "Recipe import timed out. Please try again.");
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
  let shouldResync = false;
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

    const context: ImportContext = {
      recipeId,
      source: lastImport.source ?? "server",
      sourceUrl: lastImport.sourceUrl,
    };

    const result = await watchImport(
      baseUrl,
      apiKey,
      context,
      persistLastImport,
    );
    if (result) {
      await persistLastImport(result);
    } else {
      shouldResync = true;
    }

    await syncImportMonitorAlarm();
  } finally {
    isSyncing = false;
    if (shouldResync) void syncImportStatusInBackground();
  }
}

browser.runtime.onInstalled.addListener(() => {
  void syncImportMonitorAlarm();
  void syncImportStatusInBackground();
});

browser.runtime.onStartup.addListener(() => {
  void syncImportMonitorAlarm();
  void syncImportStatusInBackground();
});

browser.runtime.onMessage.addListener((message: unknown) => {
  if (message && typeof message === "object" && "type" in message) {
    if ((message as { type?: unknown }).type === "monitor-import-now") {
      void syncImportStatusInBackground();
    }
  }
  return undefined;
});

onStorageChanged((changes, areaName) => {
  if (areaName !== "local" && areaName !== "sync") return;
  if (changes.lastImport || changes.instanceDomain || changes.apiKey) {
    void syncImportMonitorAlarm();
    void syncImportStatusInBackground();
  }
});

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== IMPORT_STATUS_SYNC_ALARM) return;
  void syncImportStatusInBackground();
});
