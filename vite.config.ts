import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type BrowserTarget = "chrome" | "firefox";

function isBrowserTarget(value: string): value is BrowserTarget {
  return value === "chrome" || value === "firefox";
}

function getPackageVersion(): string {
  const pkgPath = resolve(__dirname, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
  if (typeof pkg.version !== "string" || !pkg.version.trim()) {
    throw new Error("package.json version is missing or invalid.");
  }
  return pkg.version.trim();
}

function createManifest(target: BrowserTarget, version: string) {
  const base = {
    manifest_version: 3,
    name: "Norish Quick Import",
    version,
    description: "Quickly import recipes to a Norish instance",
    permissions: ["storage", "tabs", "alarms", "scripting", "activeTab"],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    icons: {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png",
    },
    action: {
      default_popup: "index.html",
      default_icon: {
        "16": "icons/icon16.png",
        "32": "icons/icon32.png",
        "64": "icons/icon48.png",
        "128": "icons/icon128.png",
      },
    },
  };

  if (target === "firefox") {
    return {
      ...base,
      browser_specific_settings: {
        gecko: {
          id: "{8d0c2c5a-5f6e-4d8a-8b9c-7f1e3a5b2d9f}",
          strict_min_version: "109.0",
          data_collection_permissions: {
            required: ["none"],
          },
        },
      },
      background: {
        scripts: ["background.js"],
        type: "module",
      },
    };
  }

  return {
    ...base,
    background: {
      service_worker: "background.js",
      type: "module",
    },
  };
}

function extensionManifestPlugin(target: BrowserTarget): Plugin {
  return {
    name: "norish-extension-manifest",
    generateBundle() {
      const version = getPackageVersion();
      const manifest = createManifest(target, version);
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  if (command === "build" && !isBrowserTarget(mode)) {
    throw new Error(
      `Invalid build mode "${mode}". Please specify "--mode chrome" or "--mode firefox" (no default browser).`,
    );
  }

  const target: BrowserTarget = isBrowserTarget(mode) ? mode : "chrome";

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(command === "build" ? [extensionManifestPlugin(target)] : []),
    ],
    build: {
      outDir: `dist/${target}`,
      emptyOutDir: true,
      modulePreload: false,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        input: {
          index: resolve(__dirname, "index.html"),
          background: resolve(__dirname, "src/background.ts"),
        },
        output: {
          entryFileNames: "[name].js",
          chunkFileNames: "chunks/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
  };
});
