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
import type { StoredConfig } from "../types/storage";
import {
  createNorishClient,
  defaultOriginForDomain,
  extractErrorMessage,
  importRecipeFromUrl,
} from "../lib/api";
import { isExtensionContextValid } from "../lib/chrome";
import type { StoredImport } from "../types/importStatus";

interface RecipeImportFormProps {
  config: Required<StoredConfig>;
}

const MIN_SEND_ANIMATION_MS = 700;

type Status =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "parsing"; recipeId?: string; message?: string }
  | { type: "pending"; recipeId: string; message?: string }
  | {
      type: "success";
      recipeId?: string;
      recipeName?: string;
      recipeImage?: string;
      alreadyExists?: boolean;
    }
  | { type: "error"; message: string; recipeId?: string };

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
      };
    case "pending":
      return {
        status: "pending",
        recipeId: status.recipeId,
        message: status.message,
      };
    case "success":
      return {
        status: "success",
        recipeId: status.recipeId,
        recipeName: status.recipeName,
        recipeImage: status.recipeImage,
        alreadyExists: status.alreadyExists,
      };
    case "error":
      return {
        status: "error",
        recipeId: status.recipeId,
        message: status.message,
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
      };
    case "error":
      return {
        type: "error",
        message: last.message ?? "Unknown error",
        recipeId: last.recipeId,
      };
    case "parsing":
      return {
        type: "parsing",
        recipeId: last.recipeId,
        message: last.message,
      };
    case "pending":
      if (!last.recipeId) return { type: "idle" };

      return {
        type: "pending",
        recipeId: last.recipeId,
        message: last.message,
      };
    case "loading":
    default:
      return { type: "idle" };
  }
}

export default function RecipeImportForm({ config }: RecipeImportFormProps) {
  const tabUrl = useCurrentTabUrl();
  const [recipeUrl, setRecipeUrl] = useState("");
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const planeRef = useRef<PaperAirplaneIconHandle>(null);
  const [instanceOrigin, setInstanceOrigin] = useState(() =>
    defaultOriginForDomain(config.instanceDomain),
  );

  const recipeBaseUrl = useMemo(() => {
    const origin =
      instanceOrigin || defaultOriginForDomain(config.instanceDomain);
    return `${origin.replace(/\/$/, "")}/recipes/`;
  }, [config.instanceDomain, instanceOrigin]);

  const recipeImageUrl = useMemo(() => {
    if (status.type !== "success" || !status.recipeImage) return null;
    const img = status.recipeImage.trim();
    if (!img) return null;
    if (/^(https?:\/\/|data:image\/)/i.test(img)) {
      return img;
    }
    const origin =
      instanceOrigin || defaultOriginForDomain(config.instanceDomain);
    return `${origin.replace(/\/$/, "")}${img.startsWith("/") ? "" : "/"}${img}`;
  }, [status, instanceOrigin, config.instanceDomain]);

  const persistStatus = useCallback((nextStatus: Status) => {
    if (!isExtensionContextValid()) return;

    const stored = toStoredImport(nextStatus);
    if (!stored) {
      chrome.storage.local.remove("lastImport");
      return;
    }

    chrome.storage.local.set({
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
    chrome.storage.local.remove("lastImport");
  }, []);

  const loadApiConfig = useCallback(async () => {
    const apiConfig = await createNorishClient(config);
    setInstanceOrigin(defaultOriginForDomain(config.instanceDomain));
    return apiConfig;
  }, [config]);

  const requestBackgroundMonitor = useCallback(() => {
    if (!isExtensionContextValid()) return;
    chrome.runtime.sendMessage({ type: "monitor-import-now" }, () => {
      // Ignore runtime errors if service worker is unavailable.
      void chrome.runtime.lastError;
    });
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

    chrome.storage.local.get(["lastImport"], (res) => {
      updateFromStorage(res as { lastImport?: StoredImport });
    });

    const listener = (changes: {
      [key: string]: chrome.storage.StorageChange;
    }) => {
      if (!changes.lastImport) return;

      updateFromStorage({
        lastImport: changes.lastImport.newValue as StoredImport | undefined,
      });
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [config.instanceDomain, requestBackgroundMonitor]);

  useEffect(() => {
    setInstanceOrigin(defaultOriginForDomain(config.instanceDomain));
  }, [config.instanceDomain]);

  useEffect(() => {
    if (tabUrl && !recipeUrl) {
      setRecipeUrl(tabUrl);
    }
  }, [tabUrl, recipeUrl]);

  const isBusy =
    status.type === "loading" ||
    status.type === "parsing" ||
    status.type === "pending";

  const isCurrentTabFilled =
    Boolean(tabUrl) && recipeUrl.trim() === tabUrl?.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = recipeUrl.trim();
    if (!trimmed) return;

    const animationStartedAt = Date.now();
    setStatusAndPersist({ type: "loading" });
    planeRef.current?.startAnimation();

    try {
      const { baseUrl, apiKey } = await loadApiConfig();

      const result = await importRecipeFromUrl(baseUrl, apiKey, trimmed);

      if (result.status === "exists") {
        setStatusAndPersist({
          type: "success",
          recipeId: result.recipeId,
          recipeName: result.recipeName,
          recipeImage: result.recipeImage,
          alreadyExists: true,
        });
      } else {
        setStatusAndPersist({
          type: "pending",
          recipeId: result.recipeId,
          message: "Import queued in Norish...",
        });
        requestBackgroundMonitor();
      }
    } catch (error) {
      setStatusAndPersist({
        type: "error",
        message: extractErrorMessage(error),
      });
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
              {isCurrentTabFilled && (
                <span className="text-[10px] text-muted font-medium bg-default-200/60 px-1.5 py-0.5 rounded-full">
                  Active Tab
                </span>
              )}
            </div>

            <InputGroup fullWidth className="rounded-xl">
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
      {(status.type === "parsing" || status.type === "pending") && (
        <Card className="bg-surface border border-border rounded-2xl p-3.5 shadow-xs flex flex-row items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center gap-3 min-w-0">
            <span className="relative flex size-3 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-3 rounded-full bg-primary" />
            </span>
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-xs text-foreground truncate">
                {status.type === "parsing"
                  ? "Parsing recipe..."
                  : "Importing in Norish..."}
              </span>
              <span className="text-[11px] text-muted truncate">
                {status.message || "Extracting ingredients & directions"}
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
            {recipeImageUrl ? (
              <img
                src={recipeImageUrl}
                alt={status.recipeName ?? "Recipe cover"}
                referrerPolicy="no-referrer"
                className="size-14 rounded-xl object-cover shrink-0 border border-border bg-default-100 shadow-xs"
                onError={() => {
                  console.warn("Failed to load recipe image:", recipeImageUrl);
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
                Saved to your collection
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
