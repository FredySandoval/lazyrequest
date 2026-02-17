#!/usr/bin/env bun

import { $ } from "bun"

const tag = process.env.TAG?.trim()

if (!tag) {
    throw new Error("TAG is required")
}

const existingTag = await $`git rev-parse -q --verify refs/tags/${tag}`.quiet().nothrow()
if (existingTag.exitCode === 0) {
    throw new Error(`Tag ${tag} already exists.`)
}

await $`git config --global user.email "me@fredy.dev"`
await $`git config --global user.name "lazyrequest"`

await $`git tag -a ${tag} -m Release ${tag}`
await $`git push origin ${tag}`

console.log(`Created and pushed tag ${tag}`)
