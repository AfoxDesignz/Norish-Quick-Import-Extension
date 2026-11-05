export type ImportStatusKind =
  | "loading"
  | "pending"
  | "parsing"
  | "success"
  | "error";

/** Where the recipe data came from: the Norish server or the user's browser. */
export type ImportSource = "server" | "local";

export interface StoredImport {
  status: ImportStatusKind;
  recipeId?: string;
  message?: string;
  timestamp?: number;
  recipeName?: string;
  recipeImage?: string;
  alreadyExists?: boolean;
  source?: ImportSource;
  sourceUrl?: string;
  fallbackAvailable?: boolean;
}

export function isImportInProgress(
  lastImport: StoredImport | undefined,
): boolean {
  return (
    !!lastImport?.recipeId &&
    (lastImport.status === "pending" || lastImport.status === "parsing")
  );
}
