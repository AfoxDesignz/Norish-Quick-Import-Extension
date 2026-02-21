import { useCallback, useEffect, useState } from "react";
import { getChromeRuntimeError, isExtensionContextValid } from "../lib/chrome";

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

    chrome.storage.local.get([THEME_STORAGE_KEY], (res) => {
      if (getChromeRuntimeError()) {
        setIsLoading(false);
        return;
      }

      const storedTheme = (res as { themeMode?: unknown }).themeMode;
      if (isThemeMode(storedTheme)) {
        setThemeModeState(storedTheme);
      } else {
        setThemeModeState(getSystemPreferredTheme());
      }
      setIsLoading(false);
    });

    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
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

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const setThemeMode = useCallback(async (nextMode: ThemeMode) => {
    setThemeModeState(nextMode);

    if (!isExtensionContextValid()) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      chrome.storage.local.set({ themeMode: nextMode }, () => {
        const runtimeError = getChromeRuntimeError();
        if (runtimeError) {
          reject(new Error(runtimeError));
          return;
        }
        resolve();
      });
    });
  }, []);

  return { themeMode, isLoading, setThemeMode };
}
