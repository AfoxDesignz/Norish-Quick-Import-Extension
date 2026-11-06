import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Chip,
  CloseButton,
  FieldError,
  Form,
  InputGroup,
  Label,
  Link,
  TextField,
} from "@heroui/react";
import {
  ArrowTopRightOnSquareIcon,
  BookOpenIcon,
  LinkIcon,
  XMarkIcon,
} from "@heroicons/react/16/solid";
import {
  PaperAirplaneIcon,
  type PaperAirplaneIconHandle,
} from "@heroicons-animated/react/paper-airplane";
import { useCurrentTabUrl } from "../hooks/useCurrentTabUrl";
import { DEFAULT_IMPORT_MODE, type StoredConfig } from "../types/storage";
import {
  createNorishClient,
  defaultOriginForDomain,
  extractErrorMessage,
  importRecipeFromText,
  importRecipeFromUrl,
} from "../lib/api";
import {
  browser,
  getActiveTab,
  isExtensionContextValid,
  onStorageChanged,
} from "../lib/browser";
import type { Storage } from "webextension-polyfill";
import { extractRecipeFromTab, isSameUrl } from "../lib/extract";
import type { ImportSource, StoredImport } from "../types/importStatus";

interface RecipeImportFormProps {
  config: Required<StoredConfig>;
}

const MIN_SEND_ANIMATION_MS = 700;
/** Only retry in the browser automatically for failures that just happened. */
const AUTO_FALLBACK_MAX_AGE_MS = 10 * 60 * 1000;

type Status =
  | { type: "idle" }
  | { type: "loading"; message?: string }
  | {
      type: "parsing";
      recipeId?: string;
      message?: string;
      source?: ImportSource;
      sourceUrl?: string;
    }
  | {
      type: "pending";
      recipeId: string;
      message?: string;
      source?: ImportSource;
      sourceUrl?: string;
    }
  | {
      type: "success";
      recipeId?: string;
      recipeName?: string;
      recipeImage?: string;
      alreadyExists?: boolean;
      source?: ImportSource;
    }
  | {
      type: "error";
      message: string;
      recipeId?: string;
      source?: ImportSource;
      sourceUrl?: string;
      /** Reading the page in the browser may still work. */
      fallbackAvailable?: boolean;
      /** The failure is recent enough to retry in the browser automatically. */
      autoFallback?: boolean;
    };

function toStoredImport(status: Status): StoredImport | null {
  switch (status.type) {
    case "idle":
    case "loading":
      return null;
    case "parsing":
      return {
        status: "parsing",
        recipeId: status.recipeId,
        message: status.message,
        source: status.source,
        sourceUrl: status.sourceUrl,
      };
    case "pending":
      return {
        status: "pending",
        recipeId: status.recipeId,
        message: status.message,
        source: status.source,
        sourceUrl: status.sourceUrl,
      };
    case "success":
      return {
        status: "success",
        recipeId: status.recipeId,
        recipeName: status.recipeName,
        recipeImage: status.recipeImage,
        alreadyExists: status.alreadyExists,
        source: status.source,
      };
    case "error":
      return {
        status: "error",
        recipeId: status.recipeId,
        message: status.message,
        source: status.source,
        sourceUrl: status.sourceUrl,
        fallbackAvailable: status.fallbackAvailable,
      };
  }
}

function fromStoredImport(last: StoredImport | undefined): Status {
  if (!last) return { type: "idle" };

  switch (last.status) {
    case "success":
      return {
        type: "success",
        recipeId: last.recipeId,
        recipeName: last.recipeName,
        recipeImage: last.recipeImage,
        alreadyExists: last.alreadyExists,
        source: last.source,
      };
    case "error": {
      const fallbackAvailable = Boolean(
        last.fallbackAvailable && last.sourceUrl,
      );
      return {
        type: "error",
        message: last.message ?? "Unknown error",
        recipeId: last.recipeId,
        source: last.source,
        sourceUrl: last.sourceUrl,
        fallbackAvailable,
        autoFallback:
          fallbackAvailable &&
          Date.now() - (last.timestamp ?? 0) < AUTO_FALLBACK_MAX_AGE_MS,
      };
    }
    case "parsing":
      return {
        type: "parsing",
        recipeId: last.recipeId,
        message: last.message,
        source: last.source,
        sourceUrl: last.sourceUrl,
      };
    case "pending":
      if (!last.recipeId) return { type: "idle" };

      return {
        type: "pending",
        recipeId: last.recipeId,
        message: last.message,
        source: last.source,
        sourceUrl: last.sourceUrl,
      };
    case "loading":
    default:
      return { type: "idle" };
  }
}

export default function RecipeImportForm({ config }: RecipeImportFormProps) {
  const tabUrl = useCurrentTabUrl();
  const [recipeUrl, setRecipeUrl] = useState("");
  const hasAutoFilledRef = useRef(false);
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const planeRef = useRef<PaperAirplaneIconHandle>(null);
  const autoFallbackTriedRef = useRef<string | null>(null);
  const importMode = config.importMode ?? DEFAULT_IMPORT_MODE;
  const [instanceOrigin, setInstanceOrigin] = useState(() =>
    defaultOriginForDomain(config.instanceDomain),
  );

  const recipeBaseUrl = useMemo(() => {
    const origin =
      instanceOrigin || defaultOriginForDomain(config.instanceDomain);
    return `${origin.replace(/\/$/, "")}/recipes/`;
  }, [config.instanceDomain, instanceOrigin]);

  const recipeImageCandidates = useMemo(() => {
    if (status.type !== "success" || !status.recipeImage) return [];
    const img = status.recipeImage.trim();
    if (!img) return [];
    if (/^data:image\//i.test(img)) {
      return [img];
    }
    if (/^https?:\/\//i.test(img)) {
      return [img];
    }
    const origin = (
      instanceOrigin || defaultOriginForDomain(config.instanceDomain)
    ).replace(/\/$/, "");
    const clean = img.replace(/^\/+/, "");
    const candidates = [`${origin}/${clean}`];
    if (!clean.startsWith("uploads/")) {
      candidates.push(`${origin}/uploads/${clean}`);
    }
    if (!clean.startsWith("api/")) {
      candidates.push(
        `${origin}/api/uploads/${clean.replace(/^uploads\//, "")}`,
      );
    }
    return candidates;
  }, [status, instanceOrigin, config.instanceDomain]);

  const [resolvedImageSrc, setResolvedImageSrc] = useState<string | null>(null);
  const [imageCandidateIndex, setImageCandidateIndex] = useState(0);
  const [retryWithoutNoReferrer, setRetryWithoutNoReferrer] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  useEffect(() => {
    setImageCandidateIndex(0);
    setRetryWithoutNoReferrer(false);
    setImageLoadFailed(false);

    if (recipeImageCandidates.length === 0) {
      setResolvedImageSrc(null);
      return;
    }

    const first = recipeImageCandidates[0];
    if (/^data:image\//i.test(first)) {
      setResolvedImageSrc(first);
      return;
    }

    const origin = (
      instanceOrigin || defaultOriginForDomain(config.instanceDomain)
    ).replace(/\/$/, "");
    const isInstanceUrl = Boolean(origin && first.startsWith(origin));

    if (!isInstanceUrl) {
      setResolvedImageSrc(first);
      return;
    }

    let isCancelled = false;
    let objectUrl: string | null = null;

    void (async () => {
      for (const candidate of recipeImageCandidates) {
        try {
          const res = await fetch(candidate, {
            headers: { "x-api-key": config.apiKey },
            credentials: "include",
          });
          const contentType = (
            res.headers.get("content-type") ?? ""
          ).toLowerCase();
          if (res.ok && contentType.startsWith("image/")) {
            const blob = await res.blob();
            if (isCancelled) return;
            objectUrl = URL.createObjectURL(blob);
            setResolvedImageSrc(objectUrl);
            return;
          }
        } catch {
          continue;
        }
      }

      if (!isCancelled) {
        setResolvedImageSrc(first);
      }
    })();

    return () => {
      isCancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [
    recipeImageCandidates,
    instanceOrigin,
    config.instanceDomain,
    config.apiKey,
  ]);

  const persistStatus = useCallback((nextStatus: Status) => {
    if (!isExtensionContextValid()) return;

    const stored = toStoredImport(nextStatus);
    if (!stored) {
      void browser.storage.local.remove("lastImport");
      return;
    }

    void browser.storage.local.set({
      lastImport: {
        ...stored,
        timestamp: Date.now(),
      },
    });
  }, []);

  const setStatusAndPersist = useCallback(
    (nextStatus: Status) => {
      setStatus(nextStatus);
      persistStatus(nextStatus);
    },
    [persistStatus],
  );

  const clearStatus = useCallback(() => {
    setStatus({ type: "idle" });
    if (!isExtensionContextValid()) return;
    void browser.storage.local.remove("lastImport");
  }, []);

  const loadApiConfig = useCallback(async () => {
    const apiConfig = await createNorishClient(config);
    setInstanceOrigin(defaultOriginForDomain(config.instanceDomain));
    return apiConfig;
  }, [config]);

  const requestBackgroundMonitor = useCallback(() => {
    if (!isExtensionContextValid()) return;
    void browser.runtime
      .sendMessage({ type: "monitor-import-now" })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isExtensionContextValid()) return;

    const updateFromStorage = (res: { lastImport?: StoredImport }) => {
      const next = fromStoredImport(res.lastImport);
      setStatus(next);
      if (next.type === "pending" || next.type === "parsing") {
        requestBackgroundMonitor();
      }
    };

    void browser.storage.local.get(["lastImport"]).then((res) => {
      updateFromStorage(res as { lastImport?: StoredImport });
    });

    const listener = (changes: Record<string, Storage.StorageChange>) => {
      if (!changes.lastImport) return;

      updateFromStorage({
        lastImport: changes.lastImport.newValue as StoredImport | undefined,
      });
    };

    return onStorageChanged(listener);
  }, [config.instanceDomain, requestBackgroundMonitor]);

  useEffect(() => {
    setInstanceOrigin(defaultOriginForDomain(config.instanceDomain));
  }, [config.instanceDomain]);

  useEffect(() => {
    if (tabUrl && !hasAutoFilledRef.current) {
      hasAutoFilledRef.current = true;
      setRecipeUrl((prev) => (prev ? prev : tabUrl));
    }
  }, [tabUrl]);

  /**
   * Reads the recipe from the open tab and sends it to Norish. Used as the fallback when the server cannot fetch the page and in "browser first" mode.
   */
  const runLocalImport = useCallback(
    async (url: string, serverError?: string) => {
      setStatus({
        type: "loading",
        message: "Reading the recipe from this page...",
      });

      try {
        const { baseUrl, apiKey } = await loadApiConfig();

        const tab = await getActiveTab();
        if (!tab?.id || !tab.url || !isSameUrl(tab.url, url)) {
          throw new Error(
            "Open the recipe page in the active tab, then try again.",
          );
        }

        const extraction = await extractRecipeFromTab(tab.id, tab.url);
        if (extraction.kind === "none") {
          throw new Error(
            "No recipe was found on this page (no recipe data and too little text).",
          );
        }

        const [recipeId] = await importRecipeFromText(
          baseUrl,
          apiKey,
          extraction.text,
          // Plain text can only be understood by Norish's AI parser.
          extraction.kind === "text",
        );

        setStatusAndPersist({
          type: "pending",
          recipeId,
          message: "Import queued in Norish...",
          source: "local",
          sourceUrl: url,
        });
        requestBackgroundMonitor();
      } catch (error) {
        const reason = extractErrorMessage(error);
        setStatusAndPersist({
          type: "error",
          message: serverError
            ? `${serverError} Importing from the browser failed too: ${reason}`
            : reason,
          source: "local",
          sourceUrl: url,
        });
      }
    },
    [loadApiConfig, requestBackgroundMonitor, setStatusAndPersist],
  );

  useEffect(() => {
    if (
      status.type !== "error" ||
      !status.autoFallback ||
      !status.sourceUrl ||
      importMode !== "auto"
    ) {
      return;
    }
    if (!tabUrl || !isSameUrl(tabUrl, status.sourceUrl)) return;

    const attemptKey = status.recipeId ?? status.sourceUrl;
    if (autoFallbackTriedRef.current === attemptKey) return;
    autoFallbackTriedRef.current = attemptKey;

    void runLocalImport(status.sourceUrl, status.message);
  }, [status, importMode, tabUrl, runLocalImport]);

  const isBusy =
    status.type === "loading" ||
    status.type === "parsing" ||
    status.type === "pending";

  const isCurrentTabFilled =
    Boolean(tabUrl) && recipeUrl.trim() === tabUrl?.trim();

  const runServerImport = async (url: string) => {
    try {
      const { baseUrl, apiKey } = await loadApiConfig();

      const result = await importRecipeFromUrl(baseUrl, apiKey, url);

      if (result.status === "exists") {
        setStatusAndPersist({
          type: "success",
          recipeId: result.recipeId,
          recipeName: result.recipeName,
          recipeImage: result.recipeImage,
          alreadyExists: true,
          source: "server",
        });
      } else {
        setStatusAndPersist({
          type: "pending",
          recipeId: result.recipeId,
          message: "Import queued in Norish...",
          source: "server",
          sourceUrl: url,
        });
        requestBackgroundMonitor();
      }
    } catch (error) {
      setStatusAndPersist({
        type: "error",
        message: extractErrorMessage(error),
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = recipeUrl.trim();
    if (!trimmed) return;

    const animationStartedAt = Date.now();
    setStatusAndPersist({ type: "loading" });
    planeRef.current?.startAnimation();

    try {
      if (importMode === "local" && tabUrl && isSameUrl(tabUrl, trimmed)) {
        await runLocalImport(trimmed);
      } else {
        await runServerImport(trimmed);
      }
    } finally {
      const elapsed = Date.now() - animationStartedAt;
      if (elapsed < MIN_SEND_ANIMATION_MS) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, MIN_SEND_ANIMATION_MS - elapsed),
        );
      }
      planeRef.current?.stopAnimation();
    }
  };

  const progressTitle =
    status.type === "parsing"
      ? "Parsing recipe..."
      : status.type === "pending"
        ? "Importing in Norish..."
        : status.type === "loading" && status.message
          ? "Reading page..."
          : null;

  const progressMessage =
    status.type === "parsing" ||
    status.type === "pending" ||
    status.type === "loading"
      ? status.message
      : undefined;

  const errorMessage = status.type === "error" ? status.message : "";
  const fallbackUrl =
    status.type === "error" && status.fallbackAvailable
      ? status.sourceUrl
      : undefined;
  const canRetryInBrowser =
    fallbackUrl !== undefined && isSameUrl(tabUrl, fallbackUrl);

  return (
    <div className="flex flex-col gap-3.5 w-full">
      {/* Import Form Card */}
      <Card className="bg-surface border border-border rounded-2xl p-4 shadow-xs">
        <Form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <TextField
            fullWidth
            value={recipeUrl}
            onChange={setRecipeUrl}
            isRequired
            name="recipeUrl"
            className="gap-1.5"
          >
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground">
                Recipe Link
              </Label>
              {isCurrentTabFilled ? (
                <span className="text-[10px] text-muted font-medium bg-default-200/60 px-1.5 py-0.5 rounded-full">
                  Active Tab
                </span>
              ) : tabUrl ? (
                <button
                  type="button"
                  onClick={() => setRecipeUrl(tabUrl)}
                  className="text-[10px] text-primary hover:underline font-medium cursor-pointer"
                >
                  Use active tab
                </button>
              ) : null}
            </div>

            <InputGroup
              fullWidth
              className="rounded-xl border border-border bg-surface"
            >
              <InputGroup.Prefix className="text-muted pl-2.5">
                <LinkIcon className="size-3.5" />
              </InputGroup.Prefix>
              <InputGroup.Input
                className="text-xs"
                placeholder="https://example.com/recipe"
              />
              {recipeUrl && (
                <InputGroup.Suffix className="pr-1">
                  <Button
                    type="button"
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    className="rounded-full size-6 text-muted hover:text-foreground"
                    aria-label="Clear link"
                    onPress={() => setRecipeUrl("")}
                  >
                    <XMarkIcon className="size-3.5" />
                  </Button>
                </InputGroup.Suffix>
              )}
            </InputGroup>
            <FieldError className="text-xs text-danger" />
          </TextField>

          <Button
            type="submit"
            variant="primary"
            size="md"
            className="rounded-full font-medium w-full shadow-xs mt-1 transition-all"
            isDisabled={isBusy || !recipeUrl.trim()}
            isPending={status.type === "loading"}
          >
            <PaperAirplaneIcon ref={planeRef} size={16} />
            Import to Norish
          </Button>
        </Form>
      </Card>

      {/* Parsing / Pending Progress Card */}
      {progressTitle && (
        <Card className="bg-surface border border-border rounded-2xl p-3.5 shadow-xs flex flex-row items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center gap-3 min-w-0">
            <span className="relative flex size-3 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-3 rounded-full bg-primary" />
            </span>
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-xs text-foreground truncate">
                {progressTitle}
              </span>
              <span className="text-[11px] text-muted truncate">
                {progressMessage || "Extracting ingredients & directions"}
              </span>
            </div>
          </div>
          <CloseButton
            aria-label="Dismiss status"
            className="rounded-full size-7 shrink-0 text-muted hover:text-foreground"
            onPress={clearStatus}
          />
        </Card>
      )}

      {/* Success / Already Exists Recipe Card */}
      {status.type === "success" && (
        <Card className="bg-surface border border-border rounded-2xl p-3.5 shadow-xs flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <Chip
              size="sm"
              color={status.alreadyExists ? "warning" : "success"}
              variant="soft"
              className="rounded-full text-[10px] h-5 font-medium px-2"
            >
              {status.alreadyExists
                ? "Already in library"
                : "Import successful"}
            </Chip>
            <CloseButton
              aria-label="Dismiss notification"
              className="rounded-full size-7 text-muted hover:text-foreground"
              onPress={clearStatus}
            />
          </div>

          <div className="flex items-center gap-3 min-w-0">
            {resolvedImageSrc && !imageLoadFailed ? (
              <img
                src={resolvedImageSrc}
                alt={status.recipeName ?? "Recipe cover"}
                referrerPolicy={
                  retryWithoutNoReferrer ? undefined : "no-referrer"
                }
                className="size-14 rounded-xl object-cover shrink-0 border border-border bg-default-100 shadow-xs"
                onError={() => {
                  if (
                    !resolvedImageSrc.startsWith("blob:") &&
                    !retryWithoutNoReferrer
                  ) {
                    setRetryWithoutNoReferrer(true);
                    return;
                  }
                  const nextIndex = imageCandidateIndex + 1;
                  if (
                    !resolvedImageSrc.startsWith("blob:") &&
                    nextIndex < recipeImageCandidates.length
                  ) {
                    setRetryWithoutNoReferrer(false);
                    setImageCandidateIndex(nextIndex);
                    setResolvedImageSrc(recipeImageCandidates[nextIndex]);
                    return;
                  }
                  console.warn(
                    "Failed to load recipe image:",
                    status.recipeImage,
                    recipeImageCandidates,
                  );
                  setImageLoadFailed(true);
                }}
              />
            ) : (
              <div className="size-14 rounded-xl bg-default-100 border border-border/70 grid place-items-center text-muted shrink-0">
                <BookOpenIcon className="size-6 text-muted" />
              </div>
            )}

            <div className="flex flex-col min-w-0 justify-center">
              <p
                className="font-medium text-xs leading-snug text-foreground line-clamp-2 break-words"
                title={status.recipeName}
              >
                {status.recipeName || "Recipe"}
              </p>
              <span className="text-[11px] text-muted mt-0.5">
                {status.source === "local"
                  ? "Saved from your browser page"
                  : "Saved to your collection"}
              </span>
            </div>
          </div>

          {status.recipeId && (
            <Link
              href={`${recipeBaseUrl}${status.recipeId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 w-full h-8 px-4 rounded-full bg-primary text-primary-foreground font-medium text-xs hover:bg-primary/90 transition-colors no-underline shadow-xs"
            >
              <span>Open in Norish</span>
              <ArrowTopRightOnSquareIcon className="size-3.5" />
            </Link>
          )}
        </Card>
      )}

      {/* Error Card */}
      {status.type === "error" && (
        <Alert status="danger" className="rounded-2xl p-3.5 items-start">
          <Alert.Indicator />
          <Alert.Content className="min-w-0 flex-1">
            <Alert.Title className="text-xs font-semibold">
              Import failed
            </Alert.Title>
            <Alert.Description className="text-[11px] text-foreground/80 mt-0.5 break-words">
              {status.message}
            </Alert.Description>
            {fallbackUrl &&
              (canRetryInBrowser ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="rounded-full text-xs mt-2.5"
                  onPress={() => void runLocalImport(fallbackUrl, errorMessage)}
                >
                  Retry with browser data
                </Button>
              ) : (
                <p className="text-[11px] text-muted mt-2">
                  Open the recipe page in the active tab to retry with browser
                  data.
                </p>
              ))}
          </Alert.Content>
          <CloseButton
            aria-label="Dismiss error"
            className="rounded-full size-7 text-muted hover:text-foreground mt-[-4px]"
            onPress={clearStatus}
          />
        </Alert>
      )}
    </div>
  );
}
