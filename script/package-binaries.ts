#!/usr/bin/env bun

import pkg from "../package.json"
import { $ } from "bun"
import { readdir } from "node:fs/promises"

const targetNames = await collectTargets()

if (targetNames.length === 0) {
    throw new Error(
        "No build targets found in dist/. Run `bun run build` before `bun run package`.",
    )
}

await ensurePackagingTools(targetNames)

for (const targetName of targetNames) {
    console.log(`packaging ${targetName}`)

    if (targetName.includes("-linux-")) {
        await $`tar -czf ../../${targetName}.tar.gz *`.cwd(`dist/${targetName}/bin`)
        continue
    }

    await $`zip -r ../../${targetName}.zip *`.cwd(`dist/${targetName}/bin`)
}

async function collectTargets(): Promise<string[]> {
    const entries = await readdir("dist", { withFileTypes: true })

    return entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${pkg.name}-`))
        .map((entry) => entry.name)
        .sort()
}

async function ensurePackagingTools(targetNames: string[]): Promise<void> {
    const needsTar = targetNames.some((targetName) => targetName.includes("-linux-"))
    const needsZip = targetNames.some((targetName) => !targetName.includes("-linux-"))

    if (needsTar) {
        await assertCommandInstalled("tar")
    }

    if (needsZip) {
        await assertCommandInstalled("zip")
    }
}

async function assertCommandInstalled(command: "tar" | "zip"): Promise<void> {
    try {
        await $`which ${command}`.quiet()
    } catch {
        throw new Error(
            `Missing required command '${command}'. Install it and run \`bun run package\` again.`,
        )
    }
}