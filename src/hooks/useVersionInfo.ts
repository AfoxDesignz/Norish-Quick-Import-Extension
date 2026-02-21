import { useEffect, useMemo, useState } from "react";
import { isExtensionContextValid } from "../lib/chrome";

const RELEASES_LATEST_URL =
  "https://api.github.com/repos/AfoxDesignz/Norish-Quick-Import-Extension/releases/latest";
const RELEASES_PAGE_URL =
  "https://github.com/AfoxDesignz/Norish-Quick-Import-Extension/releases";

interface VersionInfo {
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  releaseUrl: string;
}

interface VersionCacheEntry {
  latestVersion: string | null;
  checkedAt: number;
  retryAfter?: number;
}

const CACHE_KEY = "versionInfoCache";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const ERROR_RETRY_MS = 60 * 60 * 1000;
const RATE_LIMIT_RETRY_MS = 6 * 60 * 60 * 1000;

let inMemoryCache: VersionCacheEntry | null = null;
let inFlightRequest: Promise<VersionCacheEntry | null> | null = null;

function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^v/i, "");
}

function compareVersions(aRaw: string, bRaw: string): number {
  const a = normalizeVersion(aRaw);
  const b = normalizeVersion(bRaw);

  const aMain = a.split("-")[0];
  const bMain = b.split("-")[0];
  const aParts = aMain.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const bParts = bMain.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const len = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < len; i++) {
    const aNum = aParts[i] ?? 0;
    const bNum = bParts[i] ?? 0;
    if (aNum > bNum) return 1;
    if (aNum < bNum) return -1;
  }

  const aPre = a.includes("-");
  const bPre = b.includes("-");
  if (aPre && !bPre) return -1;
  if (!aPre && bPre) return 1;
  return 0;
}

function getCurrentExtensionVersion(): string {
  if (!isExtensionContextValid()) return "unknown";
  return chrome.runtime.getManifest().version;
}

function isCacheFresh(cache: VersionCacheEntry | null): boolean {
  if (!cache) return false;
  const now = Date.now();
  return now - cache.checkedAt < CACHE_TTL_MS;
}

function shouldBackoff(cache: VersionCacheEntry | null): boolean {
  if (!cache?.retryAfter) return false;
  return Date.now() < cache.retryAfter;
}

async function readCache(): Promise<VersionCacheEntry | null> {
  if (!isExtensionContextValid()) return inMemoryCache;
  if (inMemoryCache) return inMemoryCache;

  return new Promise((resolve) => {
    chrome.storage.local.get([CACHE_KEY], (result) => {
      const cache =
        (result?.[CACHE_KEY] as VersionCacheEntry | undefined) ?? null;
      inMemoryCache = cache;
      resolve(cache);
    });
  });
}

async function writeCache(cache: VersionCacheEntry): Promise<void> {
  inMemoryCache = cache;
  if (!isExtensionContextValid()) return;

  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ [CACHE_KEY]: cache }, () => resolve());
  });
}

async function fetchAndCacheLatestVersion(): Promise<VersionCacheEntry | null> {
  try {
    const response = await fetch(RELEASES_LATEST_URL, {
      headers: {
        Accept: "application/vnd.github+json",
      },
    });

    const now = Date.now();
    if (!response.ok) {
      const retryAfter =
        response.status === 403 || response.status === 429
          ? now + RATE_LIMIT_RETRY_MS
          : now + ERROR_RETRY_MS;

      const fallbackCache = (await readCache()) ?? {
        latestVersion: null,
        checkedAt: now,
      };
      const nextCache: VersionCacheEntry = {
        latestVersion: fallbackCache.latestVersion,
        checkedAt: now,
        retryAfter,
      };
      await writeCache(nextCache);
      return nextCache;
    }

    const data = (await response.json()) as { tag_name?: string };
    const tag = data.tag_name?.trim() ?? null;
    const nextCache: VersionCacheEntry = {
      latestVersion: tag,
      checkedAt: now,
    };
    await writeCache(nextCache);
    return nextCache;
  } catch {
    const now = Date.now();
    const fallbackCache = (await readCache()) ?? {
      latestVersion: null,
      checkedAt: now,
    };
    const nextCache: VersionCacheEntry = {
      latestVersion: fallbackCache.latestVersion,
      checkedAt: now,
      retryAfter: now + ERROR_RETRY_MS,
    };
    await writeCache(nextCache);
    return nextCache;
  }
}

async function getLatestVersion(): Promise<string | null> {
  const cached = await readCache();
  if (isCacheFresh(cached) || shouldBackoff(cached)) {
    return cached?.latestVersion ?? null;
  }

  if (!inFlightRequest) {
    inFlightRequest = fetchAndCacheLatestVersion().finally(() => {
      inFlightRequest = null;
    });
  }

  const fresh = await inFlightRequest;
  return fresh?.latestVersion ?? null;
}

export function useVersionInfo(): VersionInfo {
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const currentVersion = getCurrentExtensionVersion();

  useEffect(() => {
    let isCancelled = false;

    (async () => {
      const latest = await getLatestVersion();
      if (!isCancelled && latest) setLatestVersion(latest);
    })();

    return () => {
      isCancelled = true;
    };
  }, []);

  const hasUpdate = useMemo(() => {
    if (!latestVersion || currentVersion === "unknown") return false;
    return compareVersions(latestVersion, currentVersion) > 0;
  }, [currentVersion, latestVersion]);

  return {
    currentVersion,
    latestVersion,
    hasUpdate,
    releaseUrl: RELEASES_PAGE_URL,
  };
}
