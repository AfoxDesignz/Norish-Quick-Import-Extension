import { getChromeRuntimeError, setActionBadge } from "./lib/chrome";
import type { StoredConfig } from "./types/storage";
import {
  createNorishClient,
  extractErrorMessage,
  normalizeToDomain,
  type FailedEvent,
  type ImportedEvent,
  type ImportStartedEvent,
  type NorishTrpcClient,
  type PendingImportItem,
} from "./lib/api";

type StoredImport = {
  status: "loading" | "pending" | "parsing" | "success" | "error";
  recipeId?: string;
  message?: string;
  timestamp?: number;
};

const IMPORT_STATUS_SYNC_ALARM = "norish-import-monitor";
const IMPORT_STATUS_POLL_INTERVAL_MINUTES = 1;

let unsubscribeRef: (() => void) | null = null;
let activeRecipeId: string | null = null;

function stopSubscriptions() {
  if (unsubscribeRef) {
    unsubscribeRef();
    unsubscribeRef = null;
  }
  activeRecipeId = null;
}

function isImportInProgress(lastImport: StoredImport | undefined): boolean {
  return (
    !!lastImport?.recipeId &&
    (lastImport.status === "pending" || lastImport.status === "parsing")
  );
}

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

async function syncImportStatusInBackground(): Promise<void> {
  const lastImport = await getLastImport();
  if (!lastImport || !isImportInProgress(lastImport)) {
    syncBadgeWithImportStatus(lastImport);
    stopSubscriptions();
    await syncImportMonitorAlarm();
    return;
  }

  const recipeId = lastImport.recipeId;
  if (!recipeId) {
    stopSubscriptions();
    await syncImportMonitorAlarm();
    return;
  }

  const config = await getConfig();
  const domain = normalizeToDomain(config.instanceDomain);
  if (!domain || !config.apiKey) {
    stopSubscriptions();
    await syncImportMonitorAlarm();
    return;
  }

  let client: NorishTrpcClient;
  try {
    const res = await createNorishClient({
      instanceDomain: config.instanceDomain as string,
      apiKey: config.apiKey as string,
    } as Required<StoredConfig>);
    client = res.client;
  } catch {
    stopSubscriptions();
    await syncImportMonitorAlarm();
    return;
  }

  if (activeRecipeId !== recipeId || !unsubscribeRef) {
    stopSubscriptions();
    activeRecipeId = recipeId;

    const handleSubscriptionError = async (error: unknown) => {
      stopSubscriptions();
      const message = extractErrorMessage(error);
      if (isTerminalMonitorError(message)) {
        await persistLastImport({
          status: "error",
          recipeId,
          message,
        });
      }
    };

    const onImportStarted = client.subscription(
      "recipes.onImportStarted",
      undefined,
      {
        onData: (data) => {
          const payload = data as ImportStartedEvent;
          if (payload.recipeId !== activeRecipeId) return;
          void persistLastImport({
            status: "parsing",
            recipeId: payload.recipeId,
            message: "Norish is processing your recipe.",
          });
        },
        onError: handleSubscriptionError,
      },
    );

    const onImported = client.subscription("recipes.onImported", undefined, {
      onData: (data) => {
        const payload = data as ImportedEvent;
        const matches =
          payload.pendingRecipeId === activeRecipeId ||
          payload.recipe?.id === activeRecipeId;
        if (!matches) return;

        void persistLastImport({
          status: "success",
          recipeId: payload.recipe.id,
        }).then(() => {
          stopSubscriptions();
          void syncImportMonitorAlarm();
        });
      },
      onError: handleSubscriptionError,
    });

    const onFailed = client.subscription("recipes.onFailed", undefined, {
      onData: (data) => {
        const payload = data as FailedEvent;
        if (payload.recipeId !== activeRecipeId) return;

        void persistLastImport({
          status: "error",
          recipeId: payload.recipeId,
          message: payload.reason || "Import failed",
        }).then(() => {
          stopSubscriptions();
          void syncImportMonitorAlarm();
        });
      },
      onError: handleSubscriptionError,
    });

    unsubscribeRef = () => {
      onImportStarted.unsubscribe();
      onImported.unsubscribe();
      onFailed.unsubscribe();
    };
  }

  try {
    const pending = (await client.query(
      "recipes.getPending",
    )) as PendingImportItem[];

    const stillPending = pending.some((entry) => entry.recipeId === recipeId);
    if (stillPending) {
      if (lastImport.status !== "parsing") {
        await persistLastImport({
          status: "parsing",
          recipeId,
          message: "Norish is processing your recipe.",
        });
      } else {
        setActionBadge("clear");
      }
      await syncImportMonitorAlarm();
      return;
    }

    if (
      !stillPending &&
      (lastImport.status === "pending" || lastImport.status === "parsing")
    ) {
      try {
        const recipe = (await client.query("recipes.get", {
          id: recipeId,
        })) as { id: string } | null;

        await persistLastImport({
          status: "success",
          recipeId: recipe?.id,
        });
        stopSubscriptions();
      } catch {
        // Leave pending or wait for onFailed via sub
      }
    }

    await syncImportMonitorAlarm();
  } catch (error) {
    const message = extractErrorMessage(error);
    if (isTerminalMonitorError(message)) {
      await persistLastImport({
        status: "error",
        recipeId,
        message,
      });
      stopSubscriptions();
    }
    await syncImportMonitorAlarm();
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
