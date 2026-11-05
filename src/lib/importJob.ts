import type { ImportJob } from "./api";
import type { ImportSource, StoredImport } from "../types/importStatus";

/** Identifies the import a job belongs to; survives across status updates. */
export interface ImportContext {
  recipeId: string;
  source: ImportSource;
  sourceUrl?: string;
}

const STEP_LABELS: Record<string, string> = {
  "dedupe-check": "Checking for duplicates...",
  parsing: "Parsing recipe...",
  saving: "Saving recipe...",
};

export function describeImportStep(step: string | null | undefined): string {
  const trimmed = step?.trim();
  if (!trimmed) return "Norish is processing your recipe.";
  return STEP_LABELS[trimmed] ?? `Norish is working on it (${trimmed}).`;
}

export function importFailure(
  context: ImportContext,
  message: string,
  options: { fallbackAvailable?: boolean } = {},
): StoredImport {
  return {
    status: "error",
    recipeId: context.recipeId,
    message,
    source: context.source,
    sourceUrl: context.sourceUrl,
    fallbackAvailable: options.fallbackAvailable ?? false,
  };
}

/**
 * Maps a Norish import job to what we persist and show. A failed server-side import offers the browser fallback; a failed browser import does not (it already is the fallback).
 */
export function jobToStoredImport(
  job: ImportJob,
  context: ImportContext,
): StoredImport {
  const base = {
    recipeId: context.recipeId,
    source: context.source,
    sourceUrl: context.sourceUrl,
  };

  switch (job.status) {
    case "waiting":
      return {
        ...base,
        status: "pending",
        message: "Import queued in Norish...",
      };
    case "active":
      return {
        ...base,
        status: "parsing",
        message: describeImportStep(job.step),
      };
    case "completed":
      return {
        ...base,
        status: "success",
        recipeName: job.recipe?.name,
        recipeImage: job.recipe?.image ?? undefined,
      };
    case "failed": {
      const reason =
        job.error?.trim() || "Norish could not import this recipe.";
      if (context.source === "local") {
        return importFailure(context, `Browser import failed: ${reason}`);
      }
      return importFailure(context, reason, { fallbackAvailable: true });
    }
  }
}
