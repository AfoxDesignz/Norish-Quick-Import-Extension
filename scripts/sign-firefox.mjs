import { createHmac } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const AMO_API_BASE = "https://addons.mozilla.org/api/v5/addons";

function loadEnvFileIfPresent(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    const val = line
      .slice(eqIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (key && !process.env[key]) {
      process.env[key] = val;
    }
  }
}

function createAmoJwt(issuer, secret) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ iss: issuer, iat: now, exp: now + 300 }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

async function fetchExistingSignedXpiUrl(
  issuer,
  secret,
  addonId,
  targetVersion,
) {
  const url = `${AMO_API_BASE}/addon/${encodeURIComponent(addonId)}/versions/?filter=all_with_unlisted`;
  const res = await fetch(url, {
    headers: {
      Authorization: `JWT ${createAmoJwt(issuer, secret)}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const match = data?.results?.find((entry) => entry.version === targetVersion);
  if (match?.file?.status === "public" && match?.file?.url) {
    return match.file.url;
  }
  return null;
}

async function downloadSignedXpi(fileUrl, issuer, secret, destPath) {
  const res = await fetch(fileUrl, {
    headers: {
      Authorization: `JWT ${createAmoJwt(issuer, secret)}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to download signed XPI (${res.status})`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buffer);
}

loadEnvFileIfPresent(".env.local");
loadEnvFileIfPresent(".env");

const apiKey =
  process.env.WEB_EXT_API_KEY?.trim() || process.env.AMO_JWT_ISSUER?.trim();
const apiSecret =
  process.env.WEB_EXT_API_SECRET?.trim() || process.env.AMO_JWT_SECRET?.trim();
const channel = process.env.WEB_EXT_CHANNEL?.trim() || "unlisted";

if (!apiKey || !apiSecret) {
  console.error(
    [
      "Missing Mozilla Add-ons (AMO) API credentials for Firefox signing.",
      "Please set WEB_EXT_API_KEY and WEB_EXT_API_SECRET (in .env.local or environment variables).",
      "Generate keys at: https://addons.mozilla.org/developers/addon/api/key/",
    ].join("\n"),
  );
  process.exit(1);
}

const packageJsonPath = new URL("../package.json", import.meta.url);
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const version = process.env.npm_package_version || packageJson.version;

if (typeof version !== "string" || !version.trim()) {
  throw new Error("package version is not set or invalid.");
}

const distDir = "dist/firefox";
if (!existsSync(distDir)) {
  throw new Error(
    `${distDir} directory not found. Run "pnpm run build:firefox" first.`,
  );
}

const manifestPath = join(distDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const addonId = manifest?.browser_specific_settings?.gecko?.id;

const targetXpi = `norish_quick_import_firefox_v${version}.xpi`;

const existingUrl = addonId
  ? await fetchExistingSignedXpiUrl(apiKey, apiSecret, addonId, version)
  : null;
if (existingUrl) {
  console.log(
    `Version ${version} is already signed on AMO. Downloading signed package...`,
  );
  await downloadSignedXpi(existingUrl, apiKey, apiSecret, targetXpi);
  console.log(`Created signed Firefox package: ${targetXpi}`);
  process.exit(0);
}

const tmpArtifactsDir = mkdtempSync(join(tmpdir(), "norish-firefox-sign-"));

const result = spawnSync(
  process.execPath,
  [
    "./node_modules/web-ext/bin/web-ext.js",
    "sign",
    `--source-dir=${distDir}`,
    `--artifacts-dir=${tmpArtifactsDir}`,
    `--channel=${channel}`,
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      WEB_EXT_API_KEY: apiKey,
      WEB_EXT_API_SECRET: apiSecret,
    },
  },
);

if (result.error) {
  console.error(result.error);
}

if (result.status !== 0) {
  rmSync(tmpArtifactsDir, { recursive: true, force: true });
  process.exit(result.status ?? 1);
}

const files = readdirSync(tmpArtifactsDir).filter((f) => f.endsWith(".xpi"));
if (files.length === 0) {
  rmSync(tmpArtifactsDir, { recursive: true, force: true });
  throw new Error("web-ext sign completed, but no .xpi artifact was produced.");
}

if (existsSync(targetXpi)) {
  rmSync(targetXpi, { force: true });
}

renameSync(join(tmpArtifactsDir, files[0]), targetXpi);
rmSync(tmpArtifactsDir, { recursive: true, force: true });

console.log(`Created signed Firefox package: ${targetXpi}`);
