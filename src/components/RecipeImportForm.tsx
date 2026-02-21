import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  FieldError,
  Form,
  Input,
  Label,
  Link,
  TextField,
} from "@heroui/react";
import { XMarkIcon } from "@heroicons/react/20/solid";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/16/solid";
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
  type FailedEvent,
  type ImportedEvent,
  type ImportStartedEvent,
  type NorishTrpcClient,
  type PendingImportItem,
} from "../lib/api";
import { isExtensionContextValid } from "../lib/chrome";

interface RecipeImportFormProps {
  config: Required<StoredConfig>;
}

const MIN_SEND_ANIMATION_MS = 700;

type Status =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "parsing"; recipeId?: string; message?: string }
  | { type: "pending"; recipeId: string; message?: string }
  | { type: "success"; recipeId?: string; domain: string }
  | { type: "error"; message: string; recipeId?: string };

type StoredImport = {
  status: string;
  recipeId?: string;
  message?: string;
};

function toStoredImport(status: Status): StoredImport | null {
  switch (status.type) {
    case "idle":
      return null;
    case "loading":
      return { status: "loading" };
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
      return { status: "success", recipeId: status.recipeId };
    case "error":
      return {
        status: "error",
        recipeId: status.recipeId,
        message: status.message,
      };
  }
}

function fromStoredImport(
  last: StoredImport | undefined,
  domain: string,
): Status {
  if (!last) return { type: "idle" };

  switch (last.status) {
    case "success":
      return {
        type: "success",
        recipeId: last.recipeId,
        domain,
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
      return { type: "loading" };
    default:
      return { type: "idle" };
  }
}

export default function RecipeImportForm({ config }: RecipeImportFormProps) {
  const tabUrl = useCurrentTabUrl();
  const [recipeUrl, setRecipeUrl] = useState("");
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const planeRef = useRef<PaperAirplaneIconHandle>(null);
  const activeRecipeIdRef = useRef<string | null>(null);
  const clientRef = useRef<NorishTrpcClient | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const [instanceOrigin, setInstanceOrigin] = useState(() =>
    defaultOriginForDomain(config.instanceDomain),
  );

  const recipeBaseUrl = useMemo(() => {
    const origin =
      instanceOrigin || defaultOriginForDomain(config.instanceDomain);
    return `${origin.replace(/\/$/, "")}/recipes/`;
  }, [config.instanceDomain, instanceOrigin]);

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
    activeRecipeIdRef.current = null;
    setStatus({ type: "idle" });
    if (!isExtensionContextValid()) return;
    chrome.storage.local.remove("lastImport");
  }, []);

  const stopSubscriptions = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  }, []);

  const ensureClient = useCallback(async (): Promise<NorishTrpcClient> => {
    if (clientRef.current) {
      return clientRef.current;
    }

    const { client, origin } = await createNorishClient(config);
    setInstanceOrigin(origin);
    clientRef.current = client;
    return client;
  }, [config]);

  const startSubscriptions = useCallback(
    (client: NorishTrpcClient) => {
      stopSubscriptions();
      const handleSubscriptionError = (error: unknown) => {
        const activeId = activeRecipeIdRef.current;
        if (!activeId) return;

        activeRecipeIdRef.current = null;
        setStatusAndPersist({
          type: "error",
          recipeId: activeId,
          message: extractErrorMessage(error),
        });
      };

      const onImportStarted = client.subscription(
        "recipes.onImportStarted",
        undefined,
        {
          onData: (data) => {
            const payload = data as ImportStartedEvent;
            if (
              !activeRecipeIdRef.current ||
              payload.recipeId !== activeRecipeIdRef.current
            )
              return;

            setStatusAndPersist({
              type: "parsing",
              recipeId: payload.recipeId,
              message: "Norish is processing your recipe.",
            });
          },
          onError: handleSubscriptionError,
        },
      );

      const onImported = client.subscription("recipes.onImported", undefined, {
        onData: (data) => {
          const payload = data as ImportedEvent;
          const activeId = activeRecipeIdRef.current;
          if (!activeId) return;

          const matches =
            payload.pendingRecipeId === activeId ||
            payload.recipe?.id === activeId;
          if (!matches) return;

          activeRecipeIdRef.current = null;
          setStatusAndPersist({
            type: "success",
            recipeId: payload.recipe.id,
            domain: config.instanceDomain,
          });
        },
        onError: handleSubscriptionError,
      });

      const onFailed = client.subscription("recipes.onFailed", undefined, {
        onData: (data) => {
          const payload = data as FailedEvent;
          if (
            !activeRecipeIdRef.current ||
            payload.recipeId !== activeRecipeIdRef.current
          )
            return;

          activeRecipeIdRef.current = null;
          setStatusAndPersist({
            type: "error",
            recipeId: payload.recipeId,
            message: payload.reason || "Import failed",
          });
        },
        onError: handleSubscriptionError,
      });

      unsubscribeRef.current = () => {
        onImportStarted.unsubscribe();
        onImported.unsubscribe();
        onFailed.unsubscribe();
      };
    },
    [config.instanceDomain, setStatusAndPersist, stopSubscriptions],
  );

  const hydratePendingState = useCallback(async () => {
    const activeId = activeRecipeIdRef.current;
    if (!activeId || !clientRef.current) return;

    try {
      const pending = (await clientRef.current.query(
        "recipes.getPending",
      )) as PendingImportItem[];
      const isPending = pending.some((entry) => entry.recipeId === activeId);

      if (isPending && status.type !== "parsing") {
        setStatusAndPersist({
          type: "parsing",
          recipeId: activeId,
          message: "Norish is processing your recipe.",
        });
        return;
      }

      if (
        !isPending &&
        (status.type === "pending" || status.type === "parsing")
      ) {
        const recipe = (await clientRef.current.query("recipes.get", {
          id: activeId,
        })) as { id: string } | null;
        if (recipe?.id) {
          activeRecipeIdRef.current = null;
          setStatusAndPersist({
            type: "success",
            recipeId: recipe.id,
            domain: config.instanceDomain,
          });
        }
      }
    } catch {
      // Ignore
    }
  }, [config.instanceDomain, setStatusAndPersist, status.type]);

  useEffect(() => {
    if (!isExtensionContextValid()) return;

    const updateFromStorage = (res: { lastImport?: StoredImport }) => {
      const next = fromStoredImport(res.lastImport, config.instanceDomain);
      setStatus(next);

      if (next.type === "pending" || next.type === "parsing") {
        activeRecipeIdRef.current = next.recipeId ?? null;
      } else {
        activeRecipeIdRef.current = null;
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
  }, [config.instanceDomain]);

  useEffect(() => {
    if (clientRef.current) return;
    setInstanceOrigin(defaultOriginForDomain(config.instanceDomain));
  }, [config.instanceDomain]);

  useEffect(() => {
    if (tabUrl && !recipeUrl) {
      setRecipeUrl(tabUrl);
    }
  }, [tabUrl, recipeUrl]);

  useEffect(() => {
    const isTrackingImport =
      status.type === "pending" || status.type === "parsing";
    if (!isTrackingImport) {
      stopSubscriptions();
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const client = await ensureClient();
        if (cancelled) return;

        startSubscriptions(client);
        await hydratePendingState();
      } catch {
        // Ignore
      }
    })();

    return () => {
      cancelled = true;
      stopSubscriptions();
    };
  }, [
    ensureClient,
    hydratePendingState,
    startSubscriptions,
    status.type,
    stopSubscriptions,
  ]);

  useEffect(() => {
    if (!clientRef.current || !activeRecipeIdRef.current) return;

    const interval = window.setInterval(() => {
      void hydratePendingState();
    }, 7000);

    return () => window.clearInterval(interval);
  }, [hydratePendingState, status.type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = recipeUrl.trim();
    if (!trimmed) return;

    const animationStartedAt = Date.now();
    setStatusAndPersist({ type: "loading" });
    planeRef.current?.startAnimation();

    try {
      const client = await ensureClient();

      const recipeId = (await client.mutation("recipes.importFromUrl", {
        url: trimmed,
        forceAI: false,
      })) as string;

      activeRecipeIdRef.current = recipeId;
      startSubscriptions(client);
      setStatusAndPersist({
        type: "pending",
        recipeId,
        message: "Import queued. Waiting for parser status...",
      });
    } catch (error) {
      setStatusAndPersist({
        type: "error",
        message: extractErrorMessage(error),
        recipeId: activeRecipeIdRef.current ?? undefined,
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
    <Form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-end gap-2 w-full">
        <TextField
          className="flex-1"
          fullWidth
          value={recipeUrl}
          onChange={setRecipeUrl}
          isRequired
          name="recipeUrl"
        >
          <Label>Recipe URL</Label>
          <Input fullWidth placeholder="https://example.com/recipe" />
          <FieldError />
        </TextField>

        <Button
          type="submit"
          variant="primary"
          isIconOnly
          className="mb-[1px]"
          isDisabled={
            status.type === "loading" ||
            status.type === "parsing" ||
            status.type === "pending"
          }
          aria-label="Send"
        >
          <PaperAirplaneIcon ref={planeRef} size={18} />
        </Button>
      </div>

      {status.type === "parsing" && (
        <Alert status="accent" className="items-start">
          <Alert.Indicator>
            <div className="animate-spin size-4 border-2 border-current border-t-transparent rounded-full" />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>Parsing recipe...</Alert.Title>
            <Alert.Description>
              {status.message && (
                <span className="text-xs opacity-80">{status.message}</span>
              )}
            </Alert.Description>
          </Alert.Content>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            onPress={clearStatus}
            aria-label="Dismiss"
            className="mt-[-4px]"
          >
            <XMarkIcon className="size-4" />
          </Button>
        </Alert>
      )}

      {status.type === "pending" && (
        <Alert status="warning" className="items-start">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Import started</Alert.Title>
            <Alert.Description>
              <div className="flex flex-col gap-1">
                {status.message && (
                  <span className="text-xs opacity-80">{status.message}</span>
                )}
              </div>
            </Alert.Description>
          </Alert.Content>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            onPress={clearStatus}
            aria-label="Dismiss"
            className="mt-[-4px]"
          >
            <XMarkIcon className="size-4" />
          </Button>
        </Alert>
      )}

      {status.type === "success" && (
        <Alert status="success" className="items-start">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Import successful</Alert.Title>
            <Alert.Description>
              <div className="flex flex-col gap-1">
                {status.recipeId && (
                  <Link
                    href={`${recipeBaseUrl}${status.recipeId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-medium"
                  >
                    Open in Norish
                    <span className="ml-1 inline-flex items-center justify-center align-middle">
                      <ArrowTopRightOnSquareIcon className="size-4 shrink-0" />
                    </span>
                  </Link>
                )}
              </div>
            </Alert.Description>
          </Alert.Content>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            onPress={clearStatus}
            aria-label="Dismiss"
            className="mt-[-4px]"
          >
            <XMarkIcon className="size-4" />
          </Button>
        </Alert>
      )}

      {status.type === "error" && (
        <Alert status="danger" className="items-start">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Import failed</Alert.Title>
            <Alert.Description>
              <div className="flex flex-col gap-1">
                <span>{status.message}</span>
              </div>
            </Alert.Description>
          </Alert.Content>
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            onPress={clearStatus}
            aria-label="Dismiss"
            className="mt-[-4px]"
          >
            <XMarkIcon className="size-4" />
          </Button>
        </Alert>
      )}
    </Form>
  );
}
