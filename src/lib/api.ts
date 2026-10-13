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

export interface ImportUrlResult {
  /** Recipe UUID assigned by the server */
  recipeId: string;
  /**
   * "queued": recipe was newly enqueued; poll /recipes/{id} until it appears.
   * "exists": recipe already existed; no polling required.
   */
  status: "queued" | "exists";
  recipeName?: string;
  recipeImage?: string;
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
  const endpoint = `${baseUrl}/recipes/import/url`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ url, forceAI: false }),
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = extractErrorMessageFromResponse(data, response.status);
    throw new Error(message);
  }

  if (
    data &&
    typeof data === "object" &&
    "recipeId" in data &&
    typeof (data as Record<string, unknown>).recipeId === "string" &&
    "status" in data &&
    ((data as Record<string, unknown>).status === "queued" ||
      (data as Record<string, unknown>).status === "exists")
  ) {
    const d = data as Record<string, unknown>;
    const result: ImportUrlResult = {
      recipeId: d.recipeId as string,
      status: d.status as "queued" | "exists",
    };

    // extract metadata
    if (
      result.status === "exists" &&
      d.recipe &&
      typeof d.recipe === "object"
    ) {
      const recipe = d.recipe as Record<string, unknown>;
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
 * Get recipe status by ID. Returns null if recipe not found (still being parsed).
 * @param baseUrl API base URL
 * @param apiKey API authentication key
 * @param recipeId Recipe UUID
 * @returns Recipe object if found, null if 404 (still parsing/pending)
 */
export async function getRecipeStatus(
  baseUrl: string,
  apiKey: string,
  recipeId: string,
): Promise<{ id: string; name: string; image?: string | null } | null> {
  const endpoint = `${baseUrl}/recipes/${recipeId}`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
    },
  });

  if (response.status === 404) {
    // Recipe not found = still being parsed/processed
    return null;
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = extractErrorMessageFromResponse(data, response.status);
    throw new Error(message);
  }

  // Return minimal recipe info (id, name, and optional image)
  if (data && typeof data === "object" && "id" in data && "name" in data) {
    const d = data as Record<string, unknown>;
    return {
      id: d.id as string,
      name: d.name as string,
      image: extractRecipeImage(d),
    };
  }

  throw new Error("Unexpected response format from recipe endpoint");
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
  version?: string;
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
    // 1. Verify API Key against an authenticated endpoint requiring ApiKeyAuth
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

    // 2. Authentication succeeded! Retrieve optional version information from /health
    let versionStr = "";
    try {
      const healthRes = await fetch(`${origin}/api/v1/health`);
      if (healthRes.ok) {
        const data = (await healthRes.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        const versionObj = data?.versions as Record<string, string> | undefined;
        if (versionObj?.root) {
          versionStr = versionObj.root;
        }
      }
    } catch {
      // Optional version check failed, but auth was successful
    }

    return {
      ok: true,
      message: `Authentication successful!${versionStr ? ` (v${versionStr})` : ""}`,
      version: versionStr || undefined,
    };
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
