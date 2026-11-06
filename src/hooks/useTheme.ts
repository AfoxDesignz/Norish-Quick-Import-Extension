import { useCallback, useEffect, useState } from "react";
import type { Storage } from "webextension-polyfill";
import {
  browser,
  isExtensionContextValid,
  onStorageChanged,
} from "../lib/browser";

const THEME_STORAGE_KEY = "themeMode";

export type ThemeMode = "light" | "dark";

interface UseThemeReturn {
  themeMode: ThemeMode;
  isLoading: boolean;
  setThemeMode: (nextMode: ThemeMode) => Promise<void>;
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

function getSystemPreferredTheme(): ThemeMode {
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }

  return "light";
}

export function useTheme(): UseThemeReturn {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(
    getSystemPreferredTheme,
  );
  const [isLoading, setIsLoading] = useState(() => isExtensionContextValid());

  useEffect(() => {
    if (!isExtensionContextValid()) return;

    void (async () => {
      try {
        const res = await browser.storage.local.get([THEME_STORAGE_KEY]);
        const storedTheme = (res as { themeMode?: unknown }).themeMode;
        if (isThemeMode(storedTheme)) {
          setThemeModeState(storedTheme);
        } else {
          setThemeModeState(getSystemPreferredTheme());
        }
      } catch {
        setThemeModeState(getSystemPreferredTheme());
      } finally {
        setIsLoading(false);
      }
    })();

    const listener = (
      changes: Record<string, Storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "local" || !changes.themeMode) return;
      const next = changes.themeMode.newValue;
      if (isThemeMode(next)) {
        setThemeModeState(next);
        return;
      }

      if (next === undefined) {
        setThemeModeState(getSystemPreferredTheme());
      }
    };

    return onStorageChanged(listener);
  }, []);

  const setThemeMode = useCallback(async (nextMode: ThemeMode) => {
    setThemeModeState(nextMode);

    if (!isExtensionContextValid()) {
      return;
    }

    await browser.storage.local.set({ themeMode: nextMode });
  }, []);

  return { themeMode, isLoading, setThemeMode };
}
