import { useState, useEffect } from "react";
import Settings from "./pages/Settings";
import Home from "./pages/Home";
import type { StoredConfig } from "./types/storage";
import { getChromeRuntimeError, isExtensionContextValid } from "./lib/chrome";
import { useTheme } from "./hooks/useTheme";

type Page = "loading" | "settings" | "home";

export default function App() {
  const { themeMode, setThemeMode } = useTheme();
  const [page, setPage] = useState<Page>(() =>
    isExtensionContextValid() ? "loading" : "settings",
  );
  const [config, setConfig] = useState<StoredConfig>({});

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(themeMode);
    root.setAttribute("data-theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (!isExtensionContextValid()) return;

    chrome.storage.sync.get(["instanceDomain", "apiKey"], (res) => {
      if (getChromeRuntimeError()) {
        setPage("settings");
        return;
      }

      const stored = res as StoredConfig;
      setConfig(stored);
      if (stored.instanceDomain && stored.apiKey) {
        setPage("home");
      } else {
        setPage("settings");
      }
    });
  }, []);

  const handleSettingsSaved = () => {
    // Reread from storage after save to get the normalized values
    if (!isExtensionContextValid()) {
      setPage("settings");
      return;
    }

    chrome.storage.sync.get(["instanceDomain", "apiKey"], (res) => {
      if (getChromeRuntimeError()) {
        setPage("settings");
        return;
      }

      setConfig(res as StoredConfig);
      setPage("home");
    });
  };

  if (page === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[100px]">
        <span className="text-sm text-gray-500">Loading…</span>
      </div>
    );
  }

  if (page === "settings") {
    return (
      <Settings
        onNavigateHome={handleSettingsSaved}
        canGoHome={!!(config.instanceDomain && config.apiKey)}
        themeMode={themeMode}
        onThemeModeChange={setThemeMode}
      />
    );
  }

  return (
    <Home
      config={config as Required<StoredConfig>}
      onNavigateSettings={() => setPage("settings")}
    />
  );
}
