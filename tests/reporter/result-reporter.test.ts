import { describe, expect, test } from "bun:test";
import { HttpParserAdapter } from "../../src/parser/http-parser-adapter.ts";
import { VariableResolver } from "../../src/resolver/variable-resolver.ts";
import { ResultReporter } from "../../src/reporter/result-reporter.ts";
import type {
  ExecutedHttpRequestUnit,
  ExecutionResult,
  ResolvedHttpRequestUnit,
  ResponseComparisonMismatch,
} from "../../src/types/types.ts";

function resolveUnit(httpText: string): ResolvedHttpRequestUnit {
  const adapter = new HttpParserAdapter();
  const resolver = new VariableResolver();
  const [unit] = resolver.resolveSource(adapter.parseInline(httpText, "reporter-test"));

  if (!unit) {
    throw new Error("Expected at least one request unit");
  }

  return unit;
}

function createExecutedUnit(unit: ResolvedHttpRequestUnit): ExecutedHttpRequestUnit {
  return {
    sourceType: unit.sourceType,
    sourceName: unit.sourceName,
    requestIndex: unit.requestIndex,
    requestName: unit.request.name,
    request: {
      method: unit.request.method ?? "GET",
      url: unit.request.url,
      headers: [],
      body: unit.request.body?.raw ?? null,
    },
    response: {
      statusCode: 200,
      statusText: "OK",
      headers: [],
      body: "ok",
      rawBody: "ok",
      durationMs: 5,
    },
  };
}

function createResult(
  unit: ResolvedHttpRequestUnit,
  options: {
    passed: boolean;
    mismatches?: ResponseComparisonMismatch[];
    error?: Error | null;
    includeExecutedUnit?: boolean;
  },
): ExecutionResult {
  const includeExecutedUnit = options.includeExecutedUnit ?? true;
  const executedUnit = includeExecutedUnit ? createExecutedUnit(unit) : null;

  return {
    unit,
    passed: options.passed,
    executedUnit,
    comparison:
      options.error
        ? null
        : {
            passed: options.passed,
            strategy: "exact",
            mismatches: options.mismatches ?? [],
          },
    error: options.error ?? null,
  };
}

describe("ResultReporter", () => {
  test("reports successful execution with zero exit code", () => {
    const unit = resolveUnit("GET https://api.example.com/users HTTP/1.1");
    const result = createResult(unit, { passed: true });

    const infoMessages: string[] = [];
    const errorMessages: string[] = [];

    const reporter = new ResultReporter({
      output: {
        info: (message) => infoMessages.push(message),
        error: (message) => errorMessages.push(message),
      },
    });

    const report = reporter.report([result]);

    expect(report.exitCode).toBe(0);
    expect(report.summary.total).toBe(1);
    expect(report.summary.passed).toBe(1);
    expect(report.summary.failed).toBe(0);
    expect(report.summary.errors).toBe(0);
    expect(report.summary.durationMs).toBeGreaterThanOrEqual(0);
    expect(infoMessages).toContain("lazyrequest");
    expect(infoMessages).toContain("reporter-test:");
    expect(infoMessages.some((line) => line.includes("✓"))).toBe(true);
    expect(infoMessages.some((line) => line.includes("1 pass"))).toBe(true);
    expect(infoMessages.some((line) => line.includes("0 fail"))).toBe(true);
    expect(infoMessages.some((line) => line.includes("Ran 1 requests across 1 file."))).toBe(true);
    expect(errorMessages).toHaveLength(0);
  });

  test("reports comparison mismatches as failed without execution errors", () => {
    const unit = resolveUnit("GET https://api.example.com/users HTTP/1.1");
    const result = createResult(unit, {
      passed: false,
      mismatches: [
        {
          field: "statusCode",
          expected: 200,
          actual: 500,
          message: "Expected status code 200, received 500.",
        },
      ],
    });

    const infoMessages: string[] = [];
    const errorMessages: string[] = [];

    const reporter = new ResultReporter({
      output: {
        info: (message) => infoMessages.push(message),
        error: (message) => errorMessages.push(message),
      },
    });

    const report = reporter.report([result]);

    expect(report.exitCode).toBe(1);
    expect(report.summary.total).toBe(1);
    expect(report.summary.passed).toBe(0);
    expect(report.summary.failed).toBe(1);
    expect(report.summary.errors).toBe(0);
    expect(errorMessages.some((line) => line.includes("✗"))).toBe(true);
    expect(errorMessages.some((line) => line.includes("statusCode: Expected status code 200, received 500."))).toBe(
      true,
    );
    expect(infoMessages.some((line) => line.includes("0 pass"))).toBe(true);
    expect(infoMessages.some((line) => line.includes("1 fail"))).toBe(true);
  });

  test("reports execution errors and counts them separately", () => {
    const unit = resolveUnit("GET https://api.example.com/users HTTP/1.1");
    const result = createResult(unit, {
      passed: false,
      includeExecutedUnit: false,
      error: new Error("network failed"),
    });

    const infoMessages: string[] = [];
    const errorMessages: string[] = [];

    const reporter = new ResultReporter({
      output: {
        info: (message) => infoMessages.push(message),
        error: (message) => errorMessages.push(message),
      },
    });

    const report = reporter.report([result]);

    expect(report.exitCode).toBe(1);
    expect(report.summary.failed).toBe(1);
    expect(report.summary.errors).toBe(1);
    expect(errorMessages.some((line) => line.includes("error: network failed"))).toBe(true);
    expect(infoMessages.some((line) => line === " 1 error")).toBe(true);
  });

  test("prints empty execution hint when verbose and no results", () => {
    const infoMessages: string[] = [];
    const errorMessages: string[] = [];

    const reporter = new ResultReporter({
      verbose: true,
      output: {
        info: (message) => infoMessages.push(message),
        error: (message) => errorMessages.push(message),
      },
    });

    const report = reporter.report([]);

    expect(report.exitCode).toBe(0);
    expect(report.summary.total).toBe(0);
    expect(infoMessages).toContain("lazyrequest");
    expect(infoMessages.some((line) => line.includes("0 pass"))).toBe(true);
    expect(infoMessages.some((line) => line.includes("0 fail"))).toBe(true);
    expect(infoMessages.some((line) => line.includes("Ran 0 requests across 0 files."))).toBe(true);
    expect(infoMessages).toContain("No requests were executed.");
    expect(errorMessages).toHaveLength(0);
  });
});
