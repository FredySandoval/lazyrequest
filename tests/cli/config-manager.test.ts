import { test, expect, describe } from "bun:test";
import { resolve } from "node:path";

import { parseArgs } from "../../src/cli/args";
import { ConfigurationManager } from "../../src/cli/config-manager";

describe("Configuration manager", () => {
  test("builds a normalized config from inline HTTP args", () => {
    const args = parseArgs(["--http", "GET https://api.example.com/users"]);
    const manager = new ConfigurationManager(args);

    const config = manager.buildConfig();

    expect(config).toMatchObject({
      executionMode: "inline",
      searchPaths: [],
      ignorePaths: ["node_modules", ".git"],
      inlineHttpText: "GET https://api.example.com/users",
      timeout: 5000,
      defaultTimeBetweenRequests: 300,
      verbose: false,
      bail: null,
      requestExecutionStrategy: "concurrent",
      showAfterDone: false,
      defaultHeaders: {
        "user-agent": "lazyrequest/1.0",
        accept: "*/*",
      },
      maxRequests: null,
      maxDepth: 10,
    });
  });

  test("resolves folder search paths to absolute", () => {
    const args = parseArgs(["--httpFolder", "./requests"]);
    const manager = new ConfigurationManager(args);

    const config = manager.buildConfig();

    expect(config).toMatchObject({
      executionMode: "folder",
      searchPaths: [resolve("./requests")],
      inlineHttpText: null,
    });
  });
});
