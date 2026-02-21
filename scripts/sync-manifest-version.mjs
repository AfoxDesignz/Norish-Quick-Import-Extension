import { readFileSync, writeFileSync } from "node:fs";

const packageJsonPath = new URL("../package.json", import.meta.url);
const manifestPath = new URL("../public/manifest.json", import.meta.url);

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

if (typeof packageJson.version !== "string" || !packageJson.version.trim()) {
  throw new Error("package.json version is missing or invalid.");
}

if (manifest.version !== packageJson.version) {
  manifest.version = packageJson.version;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Synced manifest version to ${packageJson.version}`);
}
