#!/usr/bin/env bun

import pkg from "../package.json"
import { $ } from "bun"

interface Target {
    os: "linux" | "darwin" | "win32"
    arch: "arm64" | "x64"
    abi?: "musl"
    avx2?: false
}

const allTargets: Target[] = [
    {
        os: "linux",
        arch: "arm64",
    },
    {
        os: "linux",
        arch: "x64",
    },
    {
        os: "linux",
        arch: "x64",
        avx2: false,
    },
    {
        os: "linux",
        arch: "arm64",
        abi: "musl",
    },
    {
        os: "linux",
        arch: "x64",
        abi: "musl",
    },
    {
        os: "linux",
        arch: "x64",
        abi: "musl",
        avx2: false,
    },
    {
        os: "darwin",
        arch: "arm64",
    },
    {
        os: "darwin",
        arch: "x64",
    },
    {
        os: "darwin",
        arch: "x64",
        avx2: false,
    },
    {
        os: "win32",
        arch: "x64",
    },
    {
        os: "win32",
        arch: "x64",
        avx2: false,
    },
]

await $`rm -rf dist`

for (const target of allTargets) {
    const name = computeName(target)
    const compileTarget = computeCompileTarget(target)

    console.log(`building ${name}`)

    await $`mkdir -p dist/${name}/bin`

    const result = await Bun.build({
        tsconfig: "./tsconfig.json",
        sourcemap: "external",
        entrypoints: ["./src/index.ts"],
        compile: {
            autoloadTsconfig: true,
            target: compileTarget as Bun.Build.CompileTarget,
            outfile: `dist/${name}/bin/lazyrequest`,
        },
    })

    if (!result.success) {
        for (const log of result.logs) {
            console.error(log)
        }
        throw new Error(`Build failed for ${name}`)
    }

    await Bun.file(`dist/${name}/package.json`).write(
        JSON.stringify(
            {
                name,
                version: pkg.version,
                os: [target.os],
                cpu: [target.arch],
                ...(target.abi === "musl" ? { libc: ["musl"] } : {}),
            },
            null,
            2,
        ),
    )
}

function computeName(target: Target): string {
    return [
        pkg.name,
        // changing to win32 flags npm for some reason
        target.os === "win32" ? "windows" : target.os,
        target.arch,
        target.avx2 === false ? "baseline" : undefined,
        target.abi,
    ]
        .filter(Boolean)
        .join("-")
}

function computeCompileTarget(target: Target): string {
    let compileTarget = computeName(target).replace(`${pkg.name}-`, "bun-")

    if (isCompileTarget(compileTarget)) {
        return compileTarget
    }

    throw new Error(`Invalid compile target generated: ${compileTarget}`)
}

function isCompileTarget(value: string): boolean {
    return [
        "bun-linux-arm64",
        "bun-linux-x64",
        "bun-linux-x64-baseline",
        "bun-linux-arm64-musl",
        "bun-linux-x64-musl",
        "bun-linux-x64-baseline-musl",
        "bun-darwin-arm64",
        "bun-darwin-x64",
        "bun-darwin-x64-baseline",
        "bun-windows-x64",
        "bun-windows-x64-baseline",
    ].includes(value)
}
