#!/usr/bin/env bun

import pkg from "../package.json";
import { mkdir, readdir, rm } from "node:fs/promises";

interface Target {
  os: "linux" | "darwin" | "win32";
  arch: "arm64" | "x64";
  abi?: "musl";
  avx2?: false;
}

const allTargets: Target[] = [
  { os: "linux", arch: "arm64" },
  { os: "linux", arch: "x64" },
  { os: "linux", arch: "x64", avx2: false },
  { os: "linux", arch: "arm64", abi: "musl" },
  { os: "linux", arch: "x64", abi: "musl" },
  { os: "linux", arch: "x64", abi: "musl", avx2: false },
  { os: "darwin", arch: "arm64" },
  { os: "darwin", arch: "x64" },
  { os: "darwin", arch: "x64", avx2: false },
  { os: "win32", arch: "x64" },
  { os: "win32", arch: "x64", avx2: false },
];

const releaseVersion = process.env.RELEASE_VERSION?.trim() || pkg.version;

await rm("dist", { recursive: true, force: true });

for (const target of allTargets) {
  const targetName = getArtifactName(target);
  const targetTriple = getBunTarget(target);
  const targetDir = `dist/${targetName}`;

  console.log(`building ${targetName} (${targetTriple})`);

  await mkdir(`${targetDir}/bin`, { recursive: true });

  const result = await Bun.build({
    entrypoints: ["./src/index.ts"],
    target: "bun",
    compile: {
      target: targetTriple as never,
      outfile: `${targetDir}/bin/${pkg.name}`,
    },
  });

  if (!result.success) {
    for (const log of result.logs) {
      console.error(log.message);
    }
    throw new Error(`Build failed for ${targetName}`);
  }

  await Bun.write(
    `${targetDir}/package.json`,
    JSON.stringify(
      {
        name: targetName,
        version: releaseVersion,
        os: [target.os],
        cpu: [target.arch],
        ...(target.abi === "musl" ? { libc: ["musl"] } : {}),
      },
      null,
      2,
    ) + "\n",
  );
}

await ensureBuiltTargets(allTargets.length);

function getArtifactName(target: Target): string {
  return [
    pkg.name,
    target.os === "win32" ? "windows" : target.os,
    target.arch,
    target.avx2 === false ? "baseline" : undefined,
    target.abi,
  ]
    .filter(Boolean)
    .join("-");
}

function getBunTarget(target: Target): string {
  const os = target.os === "win32" ? "windows" : target.os;
  return ["bun", os, target.arch, target.avx2 === false ? "baseline" : undefined, target.abi]
    .filter(Boolean)
    .join("-");
}

async function ensureBuiltTargets(expected: number): Promise<void> {
  const entries = await readdir("dist", { withFileTypes: true });
  const built = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith(`${pkg.name}-`)).length;

  if (built !== expected) {
    throw new Error(`Expected ${expected} built targets but found ${built} in dist/.`);
  }
}
