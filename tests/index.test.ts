import { describe, expect, test } from "bun:test";
import { run } from "../src/index.ts";
import type {
  DiscoveryResult,
  ExecutionResult,
  LazyRequestAppDependencies,
  ParsedArgs,
  ParsedHttpSource,
  ResolvedHttpRequestUnit,
} from "../src/types/types.ts";

function createParsedArgs(overrides: Partial<ParsedArgs> = {}): ParsedArgs {
  return {
    http: undefined,
    httpFile: undefined,
    httpFolder: undefined,
    timeout: 5000,
    verbose: false,
    bail: null,
    runInBand: false,
    concurrent: false,
    showAfterDone: false,
    ...overrides,
  };
}

describe("run", () => {
  test("executes inline mode without file discovery", async () => {
    const receivedArgv: string[][] = [];
    let discoverCalled = false;
    const parseInlineCalls: Array<{ text: string; sourceName?: string }> = [];

    const parsedSources: ParsedHttpSource[] = [{ id: "inline-source" } as unknown as ParsedHttpSource];
    const units: ResolvedHttpRequestUnit[] = [{ id: "unit-1" } as unknown as ResolvedHttpRequestUnit];
    const results: ExecutionResult[] = [{ id: "result-1" } as unknown as ExecutionResult];

    const dependencies: LazyRequestAppDependencies = {
      parseArgs: (argv) => {
        receivedArgv.push(argv ?? []);
        return createParsedArgs({ http: "GET https://example.com HTTP/1.1" });
      },
      discoverHttpFiles: async () => {
        discoverCalled = true;
        return { files: [], mode: "inline", totalFound: 0 } satisfies DiscoveryResult;
      },
      createParser: () => ({
        parseInline: (text, sourceName) => {
          parseInlineCalls.push({ text, sourceName });
          return parsedSources[0]!;
        },
        parseFiles: async () => {
          throw new Error("parseFiles should not be called in inline mode");
        },
      }),
      createResolver: () => ({
        resolveSources: (sources) => {
          expect(sources).toEqual(parsedSources);
          return units;
        },
      }),
      createOrchestrator: () => ({
        execute: async (inputUnits) => {
          expect(inputUnits).toEqual(units);
          return results;
        },
      }),
      createReporter: () => ({
        report: (inputResults) => {
          expect(inputResults).toEqual(results);
          return {
            summary: {
              total: 1,
              passed: 1,
              failed: 0,
              errors: 0,
              durationMs: 0,
            },
            exitCode: 0,
          };
        },
      }),
    };

    const exitCode = await run(["--http", "GET https://example.com HTTP/1.1"], dependencies);

    expect(exitCode).toBe(0);
    expect(receivedArgv).toEqual([["--http", "GET https://example.com HTTP/1.1"]]);
    expect(discoverCalled).toBe(false);
    expect(parseInlineCalls).toEqual([
      { text: "GET https://example.com HTTP/1.1", sourceName: "inline" },
    ]);
  });

  test("executes folder mode with discovery and parseFiles", async () => {
    const discoveredFiles = ["/tmp/a.http", "/tmp/b.rest"];
    const parsedSources: ParsedHttpSource[] = [{ id: "file-source" } as unknown as ParsedHttpSource];
    const units: ResolvedHttpRequestUnit[] = [{ id: "unit-1" } as unknown as ResolvedHttpRequestUnit];
    const results: ExecutionResult[] = [{ id: "result-1" } as unknown as ExecutionResult];

    const discoveryCalls: Array<{ extensions?: string[] }> = [];
    const parseFilesCalls: string[][] = [];

    const dependencies: LazyRequestAppDependencies = {
      parseArgs: () => createParsedArgs({ httpFolder: "/tmp/requests" }),
      discoverHttpFiles: async (_config, extensions) => {
        discoveryCalls.push({ extensions });
        return {
          files: discoveredFiles,
          mode: "folder",
          totalFound: discoveredFiles.length,
        };
      },
      createParser: () => ({
        parseInline: () => {
          throw new Error("parseInline should not be called in folder mode");
        },
        parseFiles: async (filePaths) => {
          parseFilesCalls.push(filePaths);
          return parsedSources;
        },
      }),
      createResolver: () => ({
        resolveSources: () => units,
      }),
      createOrchestrator: (options) => {
        expect(options.bail).toBeNull();
        expect(options.defaultTimeBetweenRequests).toBe(300);
        expect(options.maxRequests).toBeNull();

        return {
          execute: async () => results,
        };
      },
      createReporter: (options) => {
        expect(options.verbose).toBe(false);
        return {
          report: () => ({
            summary: {
              total: 1,
              passed: 1,
              failed: 0,
              errors: 0,
              durationMs: 0,
            },
            exitCode: 0,
          }),
        };
      },
    };

    const exitCode = await run([], dependencies);

    expect(exitCode).toBe(0);
    expect(discoveryCalls).toEqual([{ extensions: [".http", ".rest"] }]);
    expect(parseFilesCalls).toEqual([discoveredFiles]);
  });

  test("returns exit code 1 when execution throws", async () => {
    const exitCode = await run([], {
      parseArgs: () => {
        throw new Error("bad args");
      },
    });

    expect(exitCode).toBe(1);
  });
});
