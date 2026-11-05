import type { StoredConfig } from "../types/storage";

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

export async function createNorishClient(
  config: Required<StoredConfig>,
): Promise<{ baseUrl: string; apiKey: string }> {
  const domain = normalizeToDomain(config.instanceDomain);
  if (!domain || !config.apiKey) {
    throw new Error("Missing instance domain or API key");
  }

  const [primaryOrigin] = candidateOrigins(domain);
  const baseUrl = `${primaryOrigin}/api/v1`;

  return {
    baseUrl,
    apiKey: config.apiKey,
  };
}

/** An error response from the Norish API, keeping the HTTP status. */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export interface ImportUrlResult {
  /** Recipe UUID assigned by the server */
  recipeId: string;
  /**
   * "queued": recipe was newly enqueued; follow it via the import status API.
   * "exists": recipe already existed; no status tracking required.
   */
  status: "queued" | "exists";
  recipeName?: string;
  recipeImage?: string;
}

export type ImportJobStatus = "waiting" | "active" | "completed" | "failed";

const IMPORT_JOB_STATUSES: readonly string[] = [
  "waiting",
  "active",
  "completed",
  "failed",
];

/** State of a queued import as reported by GET /recipes/import/status/{id}. */
export interface ImportJob {
  recipeId: string;
  status: ImportJobStatus;
  /** Step currently being executed (e.g. dedupe-check, parsing, saving). */
  step: string | null;
  /** Failure reason reported by Norish when status is "failed". */
  error: string | null;
  /** Present once the import has completed. */
  recipe: { name: string; image: string | null } | null;
}

function extractRecipeImage(d: Record<string, unknown>): string | null {
  if (typeof d.image === "string" && d.image.trim()) {
    return d.image.trim();
  }
  if (Array.isArray(d.images) && d.images.length > 0) {
    const first = d.images[0];
    if (first && typeof first === "object") {
      const imgObj = first as Record<string, unknown>;
      if (typeof imgObj.image === "string" && imgObj.image.trim()) {
        return imgObj.image.trim();
      }
    } else if (typeof first === "string" && first.trim()) {
      return first.trim();
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

async function requestJson(
  url: string,
  apiKey: string,
  init: { method: "GET" | "POST"; body?: unknown; signal?: AbortSignal },
): Promise<unknown> {
  const headers: Record<string, string> = { "x-api-key": apiKey };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(url, {
    method: init.method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new ApiError(
      extractErrorMessageFromResponse(data, response.status),
      response.status,
    );
  }

  return data;
}

/**
 * Import a recipe from a URL.
 * @param baseUrl API base URL (e.g., https://norish.example.com/api/v1)
 * @param apiKey API authentication key
 * @param url Recipe URL to import
 * @returns ImportUrlResult with recipeId, status, and optional recipe metadata
 */
export async function importRecipeFromUrl(
  baseUrl: string,
  apiKey: string,
  url: string,
): Promise<ImportUrlResult> {
  const data = asRecord(
    await requestJson(`${baseUrl}/recipes/import/url`, apiKey, {
      method: "POST",
      body: { url, forceAI: false },
    }),
  );

  if (
    data &&
    typeof data.recipeId === "string" &&
    (data.status === "queued" || data.status === "exists")
  ) {
    const result: ImportUrlResult = {
      recipeId: data.recipeId,
      status: data.status,
    };

    const recipe = asRecord(data.recipe);
    if (result.status === "exists" && recipe) {
      if (typeof recipe.name === "string") {
        result.recipeName = recipe.name;
      }
      const img = extractRecipeImage(recipe);
      if (img) {
        result.recipeImage = img;
      }
    }

    return result;
  }

  throw new Error("Unexpected response format from import endpoint");
}

/**
 * Import a recipe from text that was read from the page in the browser. Supports JSON-LD recipe objects as well as plain text (parsed by Norish AI).
 * @param useAi Force Norish to parse the text with AI (needed for plain text)
 * @returns The IDs of the recipes Norish queued
 */
export async function importRecipeFromText(
  baseUrl: string,
  apiKey: string,
  text: string,
  useAi: boolean,
): Promise<string[]> {
  const data = asRecord(
    await requestJson(`${baseUrl}/recipes/import/paste`, apiKey, {
      method: "POST",
      body: { text, forceAI: useAi },
    }),
  );

  const ids = data?.recipeIds;
  if (
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.every((id) => typeof id === "string")
  ) {
    return ids as string[];
  }

  throw new Error("Unexpected response format from import endpoint");
}

/**
 * Get the status of a queued import. The server holds the request open for up to `waitSeconds` (max 60) or until the job reaches a final state.
 */
export async function getImportStatus(
  baseUrl: string,
  apiKey: string,
  recipeId: string,
  waitSeconds = 0,
): Promise<ImportJob> {
  const wait = Math.min(Math.max(Math.floor(waitSeconds), 0), 60);
  const data = asRecord(
    await requestJson(
      `${baseUrl}/recipes/import/status/${encodeURIComponent(recipeId)}?wait=${wait}`,
      apiKey,
      {
        method: "GET",
        // Allow the server-side wait plus some network headroom.
        signal: AbortSignal.timeout((wait + 15) * 1000),
      },
    ),
  );

  if (
    data &&
    typeof data.recipeId === "string" &&
    typeof data.status === "string" &&
    IMPORT_JOB_STATUSES.includes(data.status)
  ) {
    const recipe = asRecord(data.recipe);
    return {
      recipeId: data.recipeId,
      status: data.status as ImportJobStatus,
      step: typeof data.step === "string" ? data.step : null,
      error: typeof data.error === "string" ? data.error : null,
      recipe:
        recipe && typeof recipe.name === "string"
          ? { name: recipe.name, image: extractRecipeImage(recipe) }
          : null,
    };
  }

  throw new Error("Unexpected response format from import status endpoint");
}

function extractErrorMessageFromResponse(
  data: unknown,
  status: number,
): string {
  // Try to extract error message from response body
  if (data && typeof data === "object") {
    const errorObj = data as Record<string, unknown>;
    if ("message" in errorObj && typeof errorObj.message === "string") {
      return errorObj.message;
    }
    if ("error" in errorObj && typeof errorObj.error === "string") {
      return errorObj.error;
    }
  }

  // Fallback to status codes
  switch (status) {
    case 401:
      return "Invalid API key (please check your API key in settings)";
    case 403:
      return "Access denied to this API";
    case 404:
      return "Import not found on this Norish instance";
    case 409:
      return "An import of this recipe is already in progress. Please wait and try again.";
    case 412:
      return "Video import not supported: AI or video parsing is not enabled on this Norish instance.";
    case 422:
      return "Invalid request (invalid URL format?)";
    case 503:
      return "API service is temporarily unavailable";
    default:
      return `Server error (${status})`;
  }
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

export interface TestConnectionResult {
  ok: boolean;
  message: string;
}

export async function testConnection(
  domain: string,
  apiKey: string,
): Promise<TestConnectionResult> {
  const normDomain = normalizeToDomain(domain);
  const trimmedKey = apiKey.trim();

  if (!normDomain || !trimmedKey) {
    return { ok: false, message: "Please provide both domain and API key." };
  }

  const [origin] = candidateOrigins(normDomain);

  try {
    // Verify the API key against an authenticated endpoint requiring ApiKeyAuth
    let authRes = await fetch(`${origin}/api/v1/groceries`, {
      method: "GET",
      headers: {
        "x-api-key": trimmedKey,
      },
    });

    // If /groceries returned 404 (e.g. customized instance), try /recipes/search
    if (authRes.status === 404) {
      authRes = await fetch(`${origin}/api/v1/recipes/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": trimmedKey,
        },
        body: JSON.stringify({ limit: 1 }),
      });
    }

    if (authRes.status === 401) {
      return {
        ok: false,
        message: "Server reached, but the API key is invalid.",
      };
    }

    if (authRes.status === 403) {
      return {
        ok: false,
        message:
          "Server reached, but the API key has insufficient permissions.",
      };
    }

    if (!authRes.ok) {
      return {
        ok: false,
        message: `Server returned HTTP ${authRes.status}`,
      };
    }

    return { ok: true, message: "Authentication successful!" };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? `Could not connect: ${err.message}`
          : "Host unreachable.",
    };
  }
}
