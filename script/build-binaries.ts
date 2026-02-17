#!/usr/bin/env bun

import pkg from "../package.json"
import { $ } from "bun"

interface Target {
    os: "linux" | "darwin" | "win32"
    arch: "arm64" | "x64"
    abi?: "musl"
    avx2?: false
}
const allTargets:Target[] = [
  { os: "linux", arch: "arm64" as const },
  { os: "linux", arch: "x64" as const },
  { os: "linux", arch: "x64" as const, avx2: false },
  { os: "linux", arch: "arm64" as const, abi: "musl" as const },
  { os: "linux", arch: "x64" as const, abi: "musl" as const },
  { os: "linux", arch: "x64" as const, abi: "musl" as const, avx2: false },
  { os: "darwin", arch: "arm64" as const },
  { os: "darwin", arch: "x64" as const },
  { os: "darwin", arch: "x64" as const, avx2: false },
  { os: "win32", arch: "x64" as const },
  { os: "win32", arch: "x64" as const, avx2: false },
]

await $`rm -rf dist`
