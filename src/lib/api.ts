import {
  createTRPCUntypedClient,
  httpBatchLink,
  httpSubscriptionLink,
  splitLink,
} from "@trpc/client";
import { EventSourcePolyfill } from "event-source-polyfill";
import superjson from "superjson";
import type { StoredConfig } from "../types/storage";

export interface ImportStartedEvent {
  recipeId: string;
  url: string;
}

export interface ImportedEvent {
  recipe: { id: string };
  pendingRecipeId?: string;
  toast?: "imported";
}

export interface FailedEvent {
  reason: string;
  recipeId?: string;
  url?: string;
}

export interface PendingImportItem {
  recipeId: string;
  url: string;
  addedAt: number;
}

export interface NorishTrpcClient {
  mutation: (path: string, input?: unknown) => Promise<unknown>;
  query: (path: string, input?: unknown) => Promise<unknown>;
  subscription: (
    path: string,
    input: unknown,
    opts: {
      onStarted?: () => void;
      onData?: (data: unknown) => void;
      onError?: (error: unknown) => void;
      onStopped?: () => void;
      signal?: AbortSignal;
    },
  ) => { unsubscribe: () => void };
}

interface TrpcBatchError {
  json?: {
    message?: string;
  };
  message?: string;
}

interface TrpcBatchEntry {
  result?: {
    data?: {
      json?: unknown;
    };
  };
  error?: TrpcBatchError;
}

type TrpcBatchPayload = TrpcBatchEntry[] | Record<string, TrpcBatchEntry>;

const API_PATH = "/api/trpc";

function isLocalDomain(domain: string): boolean {
  return domain.includes("localhost") || /^(\d{1,3}\.){3}\d{1,3}/.test(domain);
}

export function normalizeToDomain(
  raw: string | undefined | null,
): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  return trimmed.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function candidateOrigins(domain: string): string[] {
  const normalized = domain.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const httpOrigin = `http://${normalized}`;
  const httpsOrigin = `https://${normalized}`;

  if (isLocalDomain(normalized)) {
    return [httpOrigin, httpsOrigin];
  }

  return [httpsOrigin];
}

export function defaultOriginForDomain(domain: string): string {
  const normalized = domain.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  if (!normalized) return "";

  return isLocalDomain(normalized)
    ? `http://${normalized}`
    : `https://${normalized}`;
}

function createClient(origin: string, apiKey: string): NorishTrpcClient {
  const baseUrl = `${origin}${API_PATH}`;
  const trpcClient = createTRPCUntypedClient({
    links: [
      splitLink({
        condition: (op) => op.type === "subscription",
        true: httpSubscriptionLink({
          url: baseUrl,
          transformer: superjson,
          EventSource: EventSourcePolyfill as unknown as typeof EventSource,
          eventSourceOptions: {
            headers: {
              "x-api-key": apiKey,
            },
          } as unknown as Record<string, unknown>,
        }),
        false: httpBatchLink({
          url: baseUrl,
          transformer: superjson,
          headers: () => ({
            "x-api-key": apiKey,
          }),
        }),
      }),
    ],
  });

  const execute = async (path: string, input?: unknown): Promise<unknown> => {
    const endpoint = `${baseUrl}/${path}?batch=1`;
    const body = {
      0: {
        json: input ?? null,
      },
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const batchPayload = payload as TrpcBatchPayload | null;
    const entry = Array.isArray(batchPayload)
      ? batchPayload[0]
      : batchPayload?.["0"];
    if (!response.ok || entry?.error) {
      const message =
        entry?.error?.json?.message ??
        entry?.error?.message ??
        `Server returned ${response.status}`;
      throw new Error(message);
    }

    return entry?.result?.data?.json;
  };

  return {
    mutation: (path, input) => execute(path, input),
    query: (path, input) => execute(path, input),
    subscription: (path, input, opts) =>
      trpcClient.subscription(
        path,
        input,
        opts as Parameters<typeof trpcClient.subscription>[2],
      ),
  };
}

export async function createNorishClient(
  config: Required<StoredConfig>,
): Promise<{ client: NorishTrpcClient; origin: string }> {
  const domain = normalizeToDomain(config.instanceDomain);
  if (!domain || !config.apiKey) {
    throw new Error("Missing instance domain or API key");
  }

  const [primaryOrigin] = candidateOrigins(domain);
  return {
    client: createClient(primaryOrigin, config.apiKey),
    origin: primaryOrigin,
  };
}

export function extractErrorMessage(error: unknown): string {
  const fallback = error instanceof Error ? error.message : String(error);
  const message = fallback || "Unknown error";
  const normalized = message.toLowerCase();

  const isNetworkError = normalized.includes("failed to fetch");

  if (isNetworkError) {
    return "Norish instance unreachable.";
  }

  if (message === "You must be logged in to access this resource") {
    return "Invalid API key (please check your API key in settings)";
  }

  return message;
}
