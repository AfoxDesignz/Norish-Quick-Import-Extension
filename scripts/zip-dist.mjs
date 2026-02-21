import { createWriteStream, existsSync, rmSync, readFileSync } from "node:fs";
import archiver from "archiver";

const packageJsonPath = new URL("../package.json", import.meta.url);
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

const version = process.env.npm_package_version || packageJson.version;
if (typeof version !== "string" || !version.trim()) {
  throw new Error("package version is not set or invalid.");
}

if (!existsSync("dist")) {
  throw new Error("dist directory not found. Run build first.");
}

const zipName = `norish_quick_import_v${version}.zip`;

if (existsSync(zipName)) {
  rmSync(zipName);
}

const output = createWriteStream(zipName);
const archive = archiver("zip", { zlib: { level: 9 } });

const done = new Promise((resolve, reject) => {
  output.on("close", resolve);
  output.on("error", reject);
  archive.on("warning", (error) => {
    if (error.code === "ENOENT") {
      console.warn(error.message);
      return;
    }

    reject(error);
  });
  archive.on("error", reject);
});

archive.pipe(output);
archive.directory("dist/", false);
await archive.finalize();
await done;

console.log(`Created ${zipName}`);
