import { describe, expect, it } from "vitest";
import {
  extractRecipeFromSnapshot,
  findRecipeInJsonLd,
  isSameUrl,
  normalizePageText,
} from "./extract";

const PAGE_URL = "https://www.example.com/recipe/1";

const recipe = {
  "@type": "Recipe",
  name: "Schnitzel",
  recipeIngredient: ["4 schnitzels"],
  recipeInstructions: [{ "@type": "HowToStep", text: "Fry them." }],
};

describe("findRecipeInJsonLd", () => {
  it("finds a plain Recipe object and adds context and url", () => {
    const found = findRecipeInJsonLd([JSON.stringify(recipe)], PAGE_URL);
    expect(found).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Recipe",
      name: "Schnitzel",
      url: PAGE_URL,
    });
  });

  it("keeps the url the page declares", () => {
    const found = findRecipeInJsonLd(
      [JSON.stringify({ ...recipe, url: "https://canonical.example/r" })],
      PAGE_URL,
    );
    expect(found?.url).toBe("https://canonical.example/r");
  });

  it("finds a Recipe inside @graph and in arrays", () => {
    const graph = { "@graph": [{ "@type": "WebSite" }, recipe] };
    expect(findRecipeInJsonLd([JSON.stringify(graph)], PAGE_URL)?.name).toBe(
      "Schnitzel",
    );
    expect(
      findRecipeInJsonLd(
        [JSON.stringify([{ "@type": "Organization" }, recipe])],
        PAGE_URL,
      )?.name,
    ).toBe("Schnitzel");
  });

  it("supports @type given as an array", () => {
    const typed = { ...recipe, "@type": ["Thing", "Recipe"] };
    expect(findRecipeInJsonLd([JSON.stringify(typed)], PAGE_URL)?.name).toBe(
      "Schnitzel",
    );
  });

  it("skips invalid JSON and non-recipe blocks", () => {
    const blocks = [
      "{ not json",
      JSON.stringify({ "@type": "Organization", name: "AH" }),
      JSON.stringify(recipe),
    ];
    expect(findRecipeInJsonLd(blocks, PAGE_URL)?.name).toBe("Schnitzel");
  });

  it("returns null when there is no recipe", () => {
    expect(
      findRecipeInJsonLd([JSON.stringify({ "@type": "WebSite" })], PAGE_URL),
    ).toBeNull();
    expect(findRecipeInJsonLd([], PAGE_URL)).toBeNull();
  });
});

describe("normalizePageText", () => {
  it("collapses whitespace and prefixes the source", () => {
    const raw = `${"Zutaten   voor  vier  personen\n\n\n".repeat(12)}`;
    const text = normalizePageText(raw, PAGE_URL);
    expect(text).not.toBeNull();
    expect(text!.startsWith(`Source: ${PAGE_URL}\n\n`)).toBe(true);
    expect(text).not.toMatch(/\n\n\n/);
    expect(text).not.toMatch(/ {2}/);
  });

  it("rejects pages with too little text (e.g. a bot-protection page)", () => {
    expect(
      normalizePageText("Powered and protected by Privacy", PAGE_URL),
    ).toBeNull();
  });

  it("limits the text to 100,000 characters", () => {
    const text = normalizePageText("a".repeat(250_000), PAGE_URL);
    expect(text).toHaveLength(100_000);
  });
});

describe("extractRecipeFromSnapshot", () => {
  it("prefers JSON-LD over page text", () => {
    const result = extractRecipeFromSnapshot(
      { jsonLd: [JSON.stringify(recipe)], text: "x".repeat(500) },
      PAGE_URL,
    );
    expect(result.kind).toBe("jsonld");
    if (result.kind === "jsonld") {
      expect(result.name).toBe("Schnitzel");
      expect(JSON.parse(result.text)["@type"]).toBe("Recipe");
    }
  });

  it("falls back to the page text", () => {
    const result = extractRecipeFromSnapshot(
      { jsonLd: [], text: "Ingredient list and steps\n".repeat(20) },
      PAGE_URL,
    );
    expect(result.kind).toBe("text");
  });

  it("reports none when nothing usable is on the page", () => {
    expect(
      extractRecipeFromSnapshot({ jsonLd: [], text: "tiny" }, PAGE_URL),
    ).toEqual({ kind: "none" });
  });
});

describe("isSameUrl", () => {
  it("ignores hash and trailing slash", () => {
    expect(isSameUrl("https://a.com/x/#top", "https://a.com/x")).toBe(true);
  });

  it("distinguishes different pages and query strings", () => {
    expect(isSameUrl("https://a.com/x", "https://a.com/y")).toBe(false);
    expect(isSameUrl("https://a.com/x?a=1", "https://a.com/x?a=2")).toBe(false);
  });

  it("is false for unparsable input", () => {
    expect(isSameUrl("", "https://a.com")).toBe(false);
    expect(isSameUrl("nonsense", "nonsense")).toBe(false);
  });
});
