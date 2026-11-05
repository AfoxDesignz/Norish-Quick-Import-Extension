import { describe, expect, it } from "vitest";
import type { ImportJob } from "./api";
import {
  describeImportStep,
  importFailure,
  jobToStoredImport,
  type ImportContext,
} from "./importJob";

const serverContext: ImportContext = {
  recipeId: "r1",
  source: "server",
  sourceUrl: "https://example.com/r",
};

function job(partial: Partial<ImportJob>): ImportJob {
  return {
    recipeId: "r1",
    status: "waiting",
    step: null,
    error: null,
    recipe: null,
    ...partial,
  };
}

describe("jobToStoredImport", () => {
  it("maps waiting to pending", () => {
    expect(
      jobToStoredImport(job({ status: "waiting" }), serverContext),
    ).toMatchObject({
      status: "pending",
      recipeId: "r1",
      source: "server",
      sourceUrl: "https://example.com/r",
    });
  });

  it("maps active to parsing and shows the step", () => {
    const result = jobToStoredImport(
      job({ status: "active", step: "saving" }),
      serverContext,
    );
    expect(result.status).toBe("parsing");
    expect(result.message).toBe("Saving recipe...");
  });

  it("maps completed to success with name and image", () => {
    const result = jobToStoredImport(
      job({
        status: "completed",
        recipe: { name: "Schnitzel", image: "/img.jpg" },
      }),
      serverContext,
    );
    expect(result).toMatchObject({
      status: "success",
      recipeName: "Schnitzel",
      recipeImage: "/img.jpg",
    });
  });

  it("completed without recipe data is still a success", () => {
    expect(
      jobToStoredImport(job({ status: "completed" }), serverContext).status,
    ).toBe("success");
  });

  it("offers the browser fallback when a server import fails", () => {
    const result = jobToStoredImport(
      job({ status: "failed", error: "ah.nl refused the request (HTTP 403)" }),
      serverContext,
    );
    expect(result).toMatchObject({
      status: "error",
      message: "ah.nl refused the request (HTTP 403)",
      fallbackAvailable: true,
      sourceUrl: "https://example.com/r",
    });
  });

  it("does not offer the fallback again when a browser import fails", () => {
    const result = jobToStoredImport(
      job({ status: "failed", error: "AI is not enabled" }),
      { ...serverContext, source: "local" },
    );
    expect(result.fallbackAvailable).toBe(false);
    expect(result.message).toBe("Browser import failed: AI is not enabled");
  });

  it("uses a generic message when no error text is given", () => {
    const result = jobToStoredImport(
      job({ status: "failed", error: "  " }),
      serverContext,
    );
    expect(result.message).toBe("Norish could not import this recipe.");
  });
});

describe("describeImportStep", () => {
  it("translates known steps and tolerates unknown or missing ones", () => {
    expect(describeImportStep("dedupe-check")).toBe(
      "Checking for duplicates...",
    );
    expect(describeImportStep("something-new")).toContain("something-new");
    expect(describeImportStep(null)).toBe("Norish is processing your recipe.");
  });
});

describe("importFailure", () => {
  it("defaults to no fallback", () => {
    expect(importFailure(serverContext, "boom").fallbackAvailable).toBe(false);
  });
});
