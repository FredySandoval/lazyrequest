import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { parseArgs } from "../../src/cli/args";
import { ConfigurationManager } from "../../src/cli/config-manager";
import { discoverHttpFiles } from "../../src/discovery/file-finder";
import { HttpParserAdapter } from "../../src/parser/http-parser-adapter";
import { VariableResolver } from "../../src/resolver/variable-resolver";
import { HttpExecutor } from "../../src/executor/http-executor";
import { ResponseComparator } from "../../src/comparator/response-comparator";
import { ExecutionOrchestrator } from "../../src/orchestrator/execution-orchestrator";
import { ResultReporter } from "../../src/reporter/result-reporter";
import type { ResultReporterOutput } from "../../src/types/types";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = (async () => {
    return new Response('{"users":[{"id":1,"name":"Ada"}]}', {
      status: 200,
      statusText: "OK",
      headers: {
        "content-type": "application/json",
      },
    });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("integration: full pipeline", () => {
  test("Bug 1", async () => {
    const inlineHttp = `@contentType = application/json
@baseUrl = http://localhost:8080
###
GET {{baseUrl}}/users HTTP/1.1
Accept: {{contentType}}`;


    const args = parseArgs(["--http", inlineHttp]);
    const manager = new ConfigurationManager(args);
    const config = manager.buildConfig();
    const discovery = await discoverHttpFiles(config);

    const parser = new HttpParserAdapter();
    const parsedSources =
      config.executionMode === "inline"
        ? [parser.parseInline(config.inlineHttpText, "inline")]
        : await parser.parseFiles(discovery.files);

    const resolver = new VariableResolver();
    const units = resolver.resolveSources(parsedSources);

    const orchestrator = new ExecutionOrchestrator({
      bail: config.bail,
      maxRequests: config.maxRequests,
      defaultTimeBetweenRequests: 0,
      executor: new HttpExecutor({
        timeout: config.timeout,
        defaultHeaders: config.defaultHeaders,
      }),
      comparator: new ResponseComparator(),
    });
    const results = await orchestrator.execute(units);

    const reporterOutput: ResultReporterOutput = {
      info: () => {},
      error: () => {},
    };
    const reporter = new ResultReporter({ verbose: false, output: reporterOutput });
    const report = reporter.report(results);

    expect(report.exitCode).toBe(0);
    expect(report.summary.total).toBe(1);
    expect(report.summary.failed).toBe(0);
  });


  test("Bug 2", async () => {
    const inlineHttp = "@contentType = application/json\n@baseUrl = http://localhost:8080\n###\nGET {{baseUrl}}/users HTTP/1.1\nAccept: {{contentType}}"

    const args = parseArgs(["--http", inlineHttp]);
    const manager = new ConfigurationManager(args);
    const config = manager.buildConfig();
    const discovery = await discoverHttpFiles(config);

    const parser = new HttpParserAdapter();
    const parsedSources =
      config.executionMode === "inline"
        ? [parser.parseInline(config.inlineHttpText, "inline")]
        : await parser.parseFiles(discovery.files);

    const resolver = new VariableResolver();
    const units = resolver.resolveSources(parsedSources);

    const orchestrator = new ExecutionOrchestrator({
      bail: config.bail,
      maxRequests: config.maxRequests,
      defaultTimeBetweenRequests: 0,
      executor: new HttpExecutor({
        timeout: config.timeout,
        defaultHeaders: config.defaultHeaders,
      }),
      comparator: new ResponseComparator(),
    });
    const results = await orchestrator.execute(units);

    const reporterOutput: ResultReporterOutput = {
      info: () => {},
      error: () => {},
    };
    const reporter = new ResultReporter({ verbose: false, output: reporterOutput });
    const report = reporter.report(results);

    expect(report.exitCode).toBe(0);
    expect(report.summary.total).toBe(1);
    expect(report.summary.failed).toBe(0);
  });
});
