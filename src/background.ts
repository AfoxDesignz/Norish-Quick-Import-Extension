/// <reference types="chrome" />
const IMPORT_PATH = "/api/trpc/recipes.importFromUrl?batch=1";

type StoredConfig = { instanceDomain?: string; apiKey?: string };

function getConfig(): Promise<StoredConfig> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      ["instanceDomain", "apiKey"],
      (res: StoredConfig | any) => resolve(res),
    );
  });
}

function extractError(data: any, resp?: Response | null, entry?: any) {
  // Try tRPC entry-level error first
  const entryErr = entry?.error ?? (Array.isArray(data) && data[0]?.error) ?? (data && data["0"]?.error) ?? null;

  const raw = entryErr?.json?.message
    || entryErr?.message
    || data?.[0]?.error?.json?.message
    || data?.[0]?.json?.message
    || data?.error?.json?.message
    || data?.message
    || null;

  const httpStatus = resp?.status;
  let msg = raw || (httpStatus ? `Server returned ${httpStatus}` : "Unknown error");

  if (msg === "You must be logged in to access this resource") {
    msg = "Invalid API key (please check your API key in settings)";
  }

  const details = entryErr ?? data;
  return { message: msg, details };
}

chrome.runtime.onMessage.addListener(async (msg: any) => {
  if (!msg || msg.type !== "import-recipe") return;

  const { instanceDomain, apiKey } = await getConfig();
  if (!instanceDomain) {
    chrome.runtime.sendMessage({
      type: "error",
      message: "No Norish instance domain configured",
    });
    return;
  }
  const domain = instanceDomain;
  const path = IMPORT_PATH;
  const importUrl = domain.replace(/\/$/, "") + path;
  if (!apiKey) {
    chrome.runtime.sendMessage({
      type: "error",
      message: "No API key configured",
    });
    return;
  }

  try {
    const body = {
      "0": {
        json: { url: msg.recipeUrl, forceAI: false },
      },
    };

    const resp = await fetch(importUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey || "",
      },
      body: JSON.stringify(body),
    });

    let data: any = null;
    try {
      data = await resp.json();
    } catch (e) {
      data = null;
    }

    if (!resp.ok) {
      const { message: errMsg, details } = extractError(data, resp, undefined);
      chrome.runtime.sendMessage({ type: "error", message: errMsg, details });
      return;
    }

    let entry: any = null;
    if (Array.isArray(data) && data.length > 0) entry = data[0];
    else if (data && typeof data === "object" && data["0"]) entry = data["0"];
    else {
      chrome.runtime.sendMessage({
        type: "error",
        message: "Unexpected server response",
        details: data,
      });
      return;
    }
    if (entry.error) {
      const { message: rawMsg, details } = extractError(data, resp, entry);
      chrome.runtime.sendMessage({ type: "error", message: "Import failed: " + rawMsg, details });
      return;
    }

    const recipeId = entry.result?.data?.json;
    chrome.runtime.sendMessage({ type: "import-result", data: { recipeId } });
  } catch (err: any) {
    chrome.runtime.sendMessage({ type: "error", message: String(err) });
  } finally {
  }
});
