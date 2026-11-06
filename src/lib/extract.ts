/**
 * Reads recipe data from the page the user is looking at, so it can be sent to
 * Norish when the server cannot fetch the page itself (bot protection etc.).
 *
 * Order of preference:
 *  1. A schema.org Recipe from the page's JSON-LD (structured, no AI needed)
 *  2. The visible page text (Norish has to parse it with AI)
 */

import { browser } from "./browser";

/** Norish accepts at most 100,000 characters per pasted recipe. */
const MAX_TEXT_LENGTH = 100_000;
/** Pages with less text than this are almost certainly not a recipe. */
const MIN_TEXT_LENGTH = 200;

/** Raw data collected inside the page. Must stay JSON-serializable. */
export interface PageSnapshot {
  jsonLd: string[];
  text: string;
}

export type PageExtraction =
  | { kind: "jsonld"; text: string; name?: string }
  | { kind: "text"; text: string }
  | { kind: "none" };

/**
 * Runs inside the page via chrome.scripting.executeScript. It has to be fully
 * self-contained (no imports or outer references) because it is serialized.
 */
export function collectPageSnapshot(): PageSnapshot {
  const jsonLd = Array.from(
    document.querySelectorAll('script[type="application/ld+json"]'),
  ).map((script) => script.textContent ?? "");

  const root =
    document.querySelector<HTMLElement>("main") ??
    document.querySelector<HTMLElement>("article") ??
    document.body;

  return { jsonLd, text: root?.innerText ?? "" };
}

function isRecipeNode(node: Record<string, unknown>): boolean {
  const type = node["@type"];
  return Array.isArray(type) ? type.includes("Recipe") : type === "Recipe";
}

function findRecipeNode(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;

  const node = value as Record<string, unknown>;
  if (isRecipeNode(node)) return node;

  return findRecipeNode(node["@graph"]);
}

/** Returns the first schema.org Recipe found in the JSON-LD blocks, if any. */
export function findRecipeInJsonLd(
  blocks: string[],
  pageUrl: string,
): Record<string, unknown> | null {
  for (const block of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(block);
    } catch {
      continue;
    }

    const recipe = findRecipeNode(parsed);
    if (!recipe) continue;

    return {
      "@context": "https://schema.org",
      ...recipe,
      url: typeof recipe.url === "string" && recipe.url ? recipe.url : pageUrl,
    };
  }

  return null;
}

/** Collapses whitespace and limits the text to what Norish accepts. */
export function normalizePageText(raw: string, pageUrl: string): string | null {
  const body = raw
    .replace(/\r/g, "")
    .replace(/[ \t\u00a0]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

  if (body.length < MIN_TEXT_LENGTH) return null;

  const header = `Source: ${pageUrl}\n\n`;
  return (header + body).slice(0, MAX_TEXT_LENGTH);
}

export function extractRecipeFromSnapshot(
  snapshot: PageSnapshot,
  pageUrl: string,
): PageExtraction {
  const recipe = findRecipeInJsonLd(snapshot.jsonLd, pageUrl);
  if (recipe) {
    return {
      kind: "jsonld",
      text: JSON.stringify(recipe),
      name: typeof recipe.name === "string" ? recipe.name : undefined,
    };
  }

  const text = normalizePageText(snapshot.text, pageUrl);
  if (text) return { kind: "text", text };

  return { kind: "none" };
}

/** Compares two URLs ignoring the hash and a trailing slash. */
export function isSameUrl(a: string, b: string): boolean {
  const normalize = (raw: string): string | null => {
    try {
      const url = new URL(raw);
      url.hash = "";
      return url.href.replace(/\/$/, "");
    } catch {
      return null;
    }
  };

  const left = normalize(a);
  return left !== null && left === normalize(b);
}

/** Reads the given tab (requires activeTab, i.e. a user action on the tab). */
export async function extractRecipeFromTab(
  tabId: number,
  pageUrl: string,
): Promise<PageExtraction> {
  let snapshot: PageSnapshot | undefined;
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: collectPageSnapshot,
    });
    snapshot = results[0]?.result as PageSnapshot | undefined;
  } catch {
    throw new Error(
      "The browser does not allow reading this page. Open the recipe page in a normal tab and try again.",
    );
  }

  if (!snapshot) {
    throw new Error("Could not read the page content.");
  }

  return extractRecipeFromSnapshot(snapshot, pageUrl);
}
