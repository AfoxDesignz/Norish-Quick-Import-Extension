import { useState, useEffect } from "react";
import type { StoredConfig } from "../types/storage";
import { getChromeRuntimeError, isExtensionContextValid } from "../lib/chrome";

interface UseSettingsReturn {
  settings: StoredConfig;
  isLoading: boolean;
  saveSettings: (instanceDomain: string, apiKey: string) => Promise<void>;
}

function normalizeToDomain(raw: string): string {
  const input = raw.trim();
  if (!input) return input;

  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;

  try {
    const parsed = new URL(withScheme);
    return parsed.host;
  } catch {
    return input.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  }
}

function hostPermissionOrigins(domain: string): string[] {
  const host = domain.trim();
  if (!host) return [];

  return [`https://${host}/*`, `http://${host}/*`];
}

async function requestHostPermission(domain: string): Promise<void> {
  const origins = hostPermissionOrigins(domain);
  if (!origins.length) return;

  const contains = await new Promise<boolean>((resolve, reject) => {
    chrome.permissions.contains({ origins }, (granted) => {
      const runtimeError = getChromeRuntimeError();
      if (runtimeError) {
        reject(new Error(runtimeError));
        return;
      }

      resolve(granted);
    });
  });

  if (contains) return;

  const granted = await new Promise<boolean>((resolve, reject) => {
    chrome.permissions.request({ origins }, (result) => {
      const runtimeError = getChromeRuntimeError();
      if (runtimeError) {
        reject(new Error(runtimeError));
        return;
      }

      resolve(result);
    });
  });

  if (!granted) {
    throw new Error(
      "Host permission was denied. Please allow access for your Norish domain.",
    );
  }
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<StoredConfig>({});
  const [isLoading, setIsLoading] = useState(() => isExtensionContextValid());

  useEffect(() => {
    if (!isExtensionContextValid()) return;

    chrome.storage.sync.get(["instanceDomain", "apiKey"], (res) => {
      if (getChromeRuntimeError()) {
        setIsLoading(false);
        return;
      }

      setSettings(res as StoredConfig);
      setIsLoading(false);
    });
  }, []);

  const saveSettings = async (
    instanceDomain: string,
    apiKey: string,
  ): Promise<void> => {
    if (!isExtensionContextValid()) {
      throw new Error(
        "Extension context invalidated. Please reopen the extension popup.",
      );
    }

    const normalized = normalizeToDomain(instanceDomain);
    await requestHostPermission(normalized);
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set({ instanceDomain: normalized, apiKey }, () => {
        const runtimeError = getChromeRuntimeError();
        if (runtimeError) {
          reject(new Error(runtimeError));
          return;
        }

        setSettings({ instanceDomain: normalized, apiKey });
        resolve();
      });
    });
  };

  return { settings, isLoading, saveSettings };
}
