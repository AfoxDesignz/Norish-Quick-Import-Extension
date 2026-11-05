export type ImportMode = "auto" | "server" | "local";

export const DEFAULT_IMPORT_MODE: ImportMode = "auto";

export function isImportMode(value: unknown): value is ImportMode {
  return value === "auto" || value === "server" || value === "local";
}

export interface StoredConfig {
  instanceDomain?: string;
  apiKey?: string;
  themeMode?: "light" | "dark";
  importMode?: ImportMode;
}
