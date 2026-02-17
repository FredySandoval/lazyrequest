#!/usr/bin/env bun

import pkg from "../package.json";
import { $ } from "bun";
import { mkdir, readdir } from "node:fs/promises";

type RootPackage = {
  name: string;
  version: string;
  description?: string;
  license?: string;
  repository?: unknown;
  homepage?: string;
  bugs?: unknown;
  author?: unknown;
  keywords?: string[];
};

type TargetManifest = {
  name: string;
  version: string;
  os?: string[];
  cpu?: string[];
  libc?: string[];
};

const rootPackage = pkg as RootPackage;
const releaseVersion = process.env.RELEASE_VERSION?.trim() || rootPackage.version;
const distTag = resolveDistTag(releaseVersion, process.env.NPM_DIST_TAG);
const dryRun = isTruthy(process.env.NPM_PUBLISH_DRY_RUN);
const publishRoot = "dist/npm";

if (!dryRun && !process.env.NODE_AUTH_TOKEN?.trim()) {
  throw new Error("NODE_AUTH_TOKEN is required for npm publish.");
}

const targetNames = await collectTargets();
if (targetNames.length === 0) {
  throw new Error("No build targets found in dist/. Run `bun run build` before `bun run publish:npm`.");
}

console.log(
  `Preparing npm publish for ${rootPackage.name}@${releaseVersion} (tag: ${distTag}, dry-run: ${dryRun})`,
);

await $`rm -rf ${publishRoot}`;
await mkdir(publishRoot, { recursive: true });

const optionalDependencies: Record<string, string> = {};

for (const targetName of targetNames) {
  const sourceDir = `dist/${targetName}`;
  const sourceManifest = (await Bun.file(`${sourceDir}/package.json`).json()) as TargetManifest;
  const sourceBinary = await resolveBinaryPath(sourceDir);
  const binaryName = sourceBinary.split("/").at(-1) as string;
  const publishDir = `${publishRoot}/${targetName}`;

  await mkdir(`${publishDir}/bin`, { recursive: true });
  await Bun.write(`${publishDir}/bin/${binaryName}`, await Bun.file(sourceBinary).arrayBuffer());

  if (!binaryName.endsWith(".exe")) {
    await $`chmod 755 ${publishDir}/bin/${binaryName}`;
  }

  const targetPackageJson = {
    name: sourceManifest.name,
    version: releaseVersion,
    ...(rootPackage.description ? { description: `${rootPackage.description} (${targetName} binary)` } : {}),
    ...(rootPackage.license ? { license: rootPackage.license } : {}),
    ...(rootPackage.repository ? { repository: rootPackage.repository } : {}),
    ...(rootPackage.homepage ? { homepage: rootPackage.homepage } : {}),
    ...(rootPackage.bugs ? { bugs: rootPackage.bugs } : {}),
    ...(rootPackage.author ? { author: rootPackage.author } : {}),
    ...(rootPackage.keywords ? { keywords: rootPackage.keywords } : {}),
    os: sourceManifest.os ?? [],
    cpu: sourceManifest.cpu ?? [],
    ...(sourceManifest.libc?.length ? { libc: sourceManifest.libc } : {}),
    bin: {
      [rootPackage.name]: `./bin/${binaryName}`,
    },
    files: ["bin"],
  };

  await Bun.write(`${publishDir}/package.json`, `${JSON.stringify(targetPackageJson, null, 2)}\n`);

  await copyIfExists("README.md", `${publishDir}/README.md`);
  await copyIfExists("LICENSE.md", `${publishDir}/LICENSE.md`);

  optionalDependencies[sourceManifest.name] = releaseVersion;
}

const launcherFile = `${rootPackage.name}.js`;
const metaDir = `${publishRoot}/${rootPackage.name}`;

await mkdir(`${metaDir}/bin`, { recursive: true });
await Bun.write(`${metaDir}/bin/${launcherFile}`, createLauncherScript(rootPackage.name));
await $`chmod 755 ${metaDir}/bin/${launcherFile}`;

const metaPackageJson = {
  name: rootPackage.name,
  version: releaseVersion,
  ...(rootPackage.description ? { description: rootPackage.description } : {}),
  ...(rootPackage.license ? { license: rootPackage.license } : {}),
  ...(rootPackage.repository ? { repository: rootPackage.repository } : {}),
  ...(rootPackage.homepage ? { homepage: rootPackage.homepage } : {}),
  ...(rootPackage.bugs ? { bugs: rootPackage.bugs } : {}),
  ...(rootPackage.author ? { author: rootPackage.author } : {}),
  ...(rootPackage.keywords ? { keywords: rootPackage.keywords } : {}),
  bin: {
    [rootPackage.name]: `./bin/${launcherFile}`,
  },
  optionalDependencies,
  files: ["bin", "README.md", "LICENSE.md"],
};

await Bun.write(`${metaDir}/package.json`, `${JSON.stringify(metaPackageJson, null, 2)}\n`);
await copyIfExists("README.md", `${metaDir}/README.md`);
await copyIfExists("LICENSE.md", `${metaDir}/LICENSE.md`);

for (const targetName of targetNames) {
  await publishPackage(`${publishRoot}/${targetName}`, targetName, distTag, dryRun);
}
await publishPackage(metaDir, rootPackage.name, distTag, dryRun);

function createLauncherScript(packageName: string): string {
  return `#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const { dirname, join } = require("node:path");

const cliName = ${JSON.stringify(packageName)};
const candidates = resolveCandidates();

for (const candidate of candidates) {
  const packageRoot = resolvePackageRoot(candidate);
  if (!packageRoot) continue;

  const binaryName = process.platform === "win32" ? cliName + ".exe" : cliName;
  const binaryPath = join(packageRoot, "bin", binaryName);
  const result = spawnSync(binaryPath, process.argv.slice(2), { stdio: "inherit" });

  if (result.error) {
    if (result.error.code === "ENOENT") continue;
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.signal === "SIGILL") {
    continue;
  }

  process.exit(result.status ?? 1);
}

console.error("No compatible " + cliName + " binary was found.");
console.error("Tried: " + candidates.join(", "));
console.error("Reinstall with optional deps enabled: npm install " + cliName + " --include=optional");
process.exit(1);

function resolvePackageRoot(name) {
  try {
    return dirname(require.resolve(name + "/package.json"));
  } catch {
    return null;
  }
}

function resolveCandidates() {
  const prefix = cliName;
  const platform = process.platform;
  const arch = process.arch;
  const muslSuffix = platform === "linux" && isMusl() ? "-musl" : "";

  if (platform === "darwin") {
    if (arch === "arm64") return [prefix + "-darwin-arm64"];
    if (arch === "x64") return [prefix + "-darwin-x64", prefix + "-darwin-x64-baseline"];
    return [];
  }

  if (platform === "linux") {
    if (arch === "arm64") return [prefix + "-linux-arm64" + muslSuffix];
    if (arch === "x64") {
      return [
        prefix + "-linux-x64" + muslSuffix,
        prefix + "-linux-x64-baseline" + muslSuffix,
      ];
    }
    return [];
  }

  if (platform === "win32") {
    if (arch === "x64") return [prefix + "-windows-x64", prefix + "-windows-x64-baseline"];
    return [];
  }

  return [];
}

function isMusl() {
  if (process.platform !== "linux") return false;
  if (!process.report || typeof process.report.getReport !== "function") return false;

  try {
    const report = process.report.getReport();
    return !report?.header?.glibcVersionRuntime;
  } catch {
    return false;
  }
}
`;
}

async function collectTargets(): Promise<string[]> {
  const entries = await readdir("dist", { withFileTypes: true });
  const targets: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith(`${rootPackage.name}-`)) {
      continue;
    }

    if (await Bun.file(`dist/${entry.name}/package.json`).exists()) {
      targets.push(entry.name);
    }
  }

  return targets.sort();
}

async function resolveBinaryPath(targetDir: string): Promise<string> {
  const directNames = [`${rootPackage.name}.exe`, rootPackage.name];

  for (const binaryName of directNames) {
    const directPath = `${targetDir}/bin/${binaryName}`;
    if (await Bun.file(directPath).exists()) {
      return directPath;
    }
  }

  for (const relativePath of new Bun.Glob("**/*").scanSync({ cwd: `${targetDir}/bin` })) {
    const filename = relativePath.split("/").at(-1);
    if (filename === rootPackage.name || filename === `${rootPackage.name}.exe`) {
      return `${targetDir}/bin/${relativePath}`;
    }
  }

  throw new Error(`Unable to find compiled binary in ${targetDir}/bin`);
}

async function copyIfExists(sourcePath: string, destinationPath: string): Promise<void> {
  if (!(await Bun.file(sourcePath).exists())) {
    return;
  }
  await Bun.write(destinationPath, await Bun.file(sourcePath).arrayBuffer());
}

async function publishPackage(
  packageDir: string,
  packageName: string,
  npmTag: string,
  isDryRun: boolean,
): Promise<void> {
  const mode = isDryRun ? "dry-run" : "publish";
  console.log(`${mode} ${packageName} (${npmTag})`);

  if (isDryRun) {
    await $`npm publish . --tag ${npmTag} --dry-run`.cwd(packageDir);
    return;
  }

  if (packageName.startsWith("@")) {
    await $`npm publish . --tag ${npmTag} --access public`.cwd(packageDir);
    return;
  }

  await $`npm publish . --tag ${npmTag}`.cwd(packageDir);
}

function resolveDistTag(version: string, explicitTag?: string): string {
  const trimmedTag = explicitTag?.trim();
  if (trimmedTag) {
    return trimmedTag;
  }

  const prerelease = version.split("-")[1];
  if (prerelease) {
    return prerelease.split(".")[0] || "next";
  }

  return "latest";
}

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}
