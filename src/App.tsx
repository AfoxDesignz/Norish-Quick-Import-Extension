import { useState, useEffect } from "react";
import Settings from "./pages/Settings";
import Home from "./pages/Home";
import type { StoredConfig } from "./types/storage";
import { browser, isExtensionContextValid } from "./lib/browser";
import { useTheme } from "./hooks/useTheme";

type Page = "loading" | "settings" | "home";

const CONFIG_KEYS = ["instanceDomain", "apiKey", "importMode"];

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

    const loadConfig = async () => {
      try {
        const res = (await browser.storage.sync.get(
          CONFIG_KEYS,
        )) as StoredConfig;
        setConfig(res);
        if (res.instanceDomain && res.apiKey) {
          setPage("home");
        } else {
          setPage("settings");
        }
      } catch {
        setPage("settings");
      }
    };

    void loadConfig();
  }, []);

  const handleSettingsSaved = () => {
    // Reread from storage after save to get the normalized values
    if (!isExtensionContextValid()) {
      setPage("settings");
      return;
    }

    void (async () => {
      try {
        const res = (await browser.storage.sync.get(
          CONFIG_KEYS,
        )) as StoredConfig;
        setConfig(res);
        setPage("home");
      } catch {
        setPage("settings");
      }
    })();
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
      themeMode={themeMode}
      onThemeModeChange={setThemeMode}
    />
  );
}
