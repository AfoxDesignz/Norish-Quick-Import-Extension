import { useState, useEffect } from "react";
import {
  DEFAULT_IMPORT_MODE,
  isImportMode,
  type ImportMode,
  type StoredConfig,
} from "../types/storage";
import {
  browser,
  isExtensionContextValid,
  requestHostPermission,
} from "../lib/browser";

interface UseSettingsReturn {
  settings: StoredConfig;
  isLoading: boolean;
  saveSettings: (
    instanceDomain: string,
    apiKey: string,
    importMode: ImportMode,
  ) => Promise<void>;
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

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<StoredConfig>({});
  const [isLoading, setIsLoading] = useState(() => isExtensionContextValid());

  useEffect(() => {
    if (!isExtensionContextValid()) return;

    void (async () => {
      try {
        const res = (await browser.storage.sync.get([
          "instanceDomain",
          "apiKey",
          "importMode",
        ])) as StoredConfig;

        setSettings({
          ...res,
          importMode: isImportMode(res.importMode)
            ? res.importMode
            : DEFAULT_IMPORT_MODE,
        });
      } catch {
        return;
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const saveSettings = async (
    instanceDomain: string,
    apiKey: string,
    importMode: ImportMode,
  ): Promise<void> => {
    if (!isExtensionContextValid()) {
      throw new Error(
        "Extension context invalidated. Please reopen the extension popup.",
      );
    }

    const normalized = normalizeToDomain(instanceDomain);
    await requestHostPermission(hostPermissionOrigins(normalized));
    await browser.storage.sync.set({
      instanceDomain: normalized,
      apiKey,
      importMode,
    });
    setSettings({ instanceDomain: normalized, apiKey, importMode });
  };

  return { settings, isLoading, saveSettings };
}
