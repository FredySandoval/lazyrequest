#!/usr/bin/env bun

import pkg from "../package.json"
import { appendFileSync } from "node:fs"

type Bump = "major" | "minor" | "patch"

const eventName = process.env.EVENT_NAME ?? ""
const refName = process.env.REF_NAME ?? ""
const versionInput = normalizeVersionInput(process.env.INPUT_VERSION)
const bumpInput = normalizeBumpInput(process.env.INPUT_BUMP)
const outputFile = process.env.GITHUB_OUTPUT

if (!outputFile) {
    throw new Error("GITHUB_OUTPUT is required")
}

const version = resolveVersion({ eventName, refName, versionInput, bumpInput })
const tag = `v${version}`

appendOutput(outputFile, "version", version)
appendOutput(outputFile, "tag", tag)

console.log(`Resolved release version: ${version}`)
console.log(`Resolved release tag: ${tag}`)

function resolveVersion(args: {
    eventName: string
    refName: string
    versionInput?: string
    bumpInput: Bump
}): string {
    if (args.eventName === "push") {
        if (!args.refName.startsWith("v")) {
            throw new Error(`Expected tag ref name starting with 'v', got: ${args.refName}`)
        }

        const versionFromTag = args.refName.slice(1)
        assertSemver(versionFromTag)
        return versionFromTag
    }

    if (args.versionInput) {
        assertSemver(args.versionInput)
        return args.versionInput
    }

    const baseVersion = pkg.version
    assertSemver(baseVersion)

    return bumpVersion(baseVersion, args.bumpInput)
}

function bumpVersion(version: string, bump: Bump): string {
    let [major, minor, patch] = parseSemver(version)

    if (bump === "major") {
        major += 1
        minor = 0
        patch = 0
    } else if (bump === "minor") {
        minor += 1
        patch = 0
    } else {
        patch += 1
    }

    return `${major}.${minor}.${patch}`
}

function parseSemver(version: string): [number, number, number] {
    const parts = version.split(".")
    if (parts.length !== 3) {
        throw new Error(`Invalid version '${version}'. Expected format: X.Y.Z`)
    }

    const major = Number(parts[0])
    const minor = Number(parts[1])
    const patch = Number(parts[2])

    if ([major, minor, patch].some((value) => Number.isNaN(value))) {
        throw new Error(`Invalid version '${version}'. Expected numeric parts in X.Y.Z`)
    }

    return [major, minor, patch]
}

function normalizeVersionInput(value: string | undefined): string | undefined {
    if (!value) {
        return undefined
    }

    const trimmed = value.trim()
    if (!trimmed) {
        return undefined
    }

    return trimmed.startsWith("v") ? trimmed.slice(1) : trimmed
}

function normalizeBumpInput(value: string | undefined): Bump {
    if (value === "major" || value === "minor" || value === "patch") {
        return value
    }

    return "patch"
}

function assertSemver(version: string): void {
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
        throw new Error(`Invalid version '${version}'. Expected format: X.Y.Z`)
    }
}

function appendOutput(path: string, key: string, value: string): void {
    appendFileSync(path, `${key}=${value}\n`)
}
