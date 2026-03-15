export type ImportStatusKind =
  | "loading"
  | "pending"
  | "parsing"
  | "success"
  | "error";

export interface StoredImport {
  status: ImportStatusKind;
  recipeId?: string;
  message?: string;
  timestamp?: number;
}

export function isImportInProgress(
  lastImport: StoredImport | undefined,
): boolean {
  return (
    !!lastImport?.recipeId &&
    (lastImport.status === "pending" || lastImport.status === "parsing")
  );
}
