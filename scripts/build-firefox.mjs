import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(projectRoot, "build", "firefox");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(resolve(outputDirectory, "icons"), { recursive: true });
await mkdir(resolve(outputDirectory, "calendar"), { recursive: true });

await Promise.all([
  build({
    absWorkingDir: projectRoot,
    entryPoints: ["./src/content.js"],
    bundle: true,
    outfile: resolve(outputDirectory, "content.js"),
    platform: "browser",
    format: "iife",
    target: "firefox142",
  }),
  build({
    absWorkingDir: projectRoot,
    entryPoints: ["./src/background.js"],
    bundle: true,
    outfile: resolve(outputDirectory, "background.js"),
    platform: "browser",
    format: "iife",
    target: "firefox142",
  }),
  build({
    absWorkingDir: projectRoot,
    entryPoints: ["./src/popup.js"],
    bundle: true,
    outfile: resolve(outputDirectory, "popup.js"),
    platform: "browser",
    format: "iife",
    target: "firefox142",
  }),
]);

await Promise.all([
  copyFile(resolve(projectRoot, "manifest.json"), resolve(outputDirectory, "manifest.json")),
  copyFile(resolve(projectRoot, "src", "content.css"), resolve(outputDirectory, "content.css")),
  copyFile(resolve(projectRoot, "src", "popup.html"), resolve(outputDirectory, "popup.html")),
  copyFile(resolve(projectRoot, "src", "popup.css"), resolve(outputDirectory, "popup.css")),
  ...[
    "schedule-parser.js",
    "ics-generator.js",
    "calendar-ui.js",
    "calendar-export.js",
    "calendar.css",
  ].map((fileName) =>
    copyFile(
      resolve(projectRoot, "src", "calendar", fileName),
      resolve(outputDirectory, "calendar", fileName),
    ),
  ),
  ...[16, 32, 48, 96, 128].map((size) =>
    copyFile(
      resolve(projectRoot, "src", "icons", `icon-${size}.svg`),
      resolve(outputDirectory, "icons", `icon-${size}.svg`),
    ),
  ),
]);

console.log(`Firefox extension built at ${outputDirectory}`);
