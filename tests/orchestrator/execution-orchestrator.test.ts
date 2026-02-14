import { describe, expect, test } from "bun:test";
import { HttpParserAdapter } from "../../src/parser/http-parser-adapter.ts";
import { VariableResolver } from "../../src/resolver/variable-resolver.ts";
import { ExecutionOrchestrator } from "../../src/orchestrator/execution-orchestrator.ts";
import type {
  ExecutedHttpRequestUnit,
  ExecutionHttpExecutor,
  ExecutionResponseComparator,
  ResolvedHttpRequestUnit,
  ResponseComparisonContext,
  ResponseComparisonResult,
} from "../../src/types/types.ts";

function resolveUnits(httpText: string): ResolvedHttpRequestUnit[] {
  const adapter = new HttpParserAdapter();
  const resolver = new VariableResolver();
  return resolver.resolveSource(adapter.parseInline(httpText, "orchestrator-test"));
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
      durationMs: 1,
    },
  };
}

function createComparator(
  decide: (context: ResponseComparisonContext) => ResponseComparisonResult,
): ExecutionResponseComparator {
  return {
    compare: decide,
  };
}

describe("ExecutionOrchestrator", () => {
  test("executes request units sequentially and returns comparison results", async () => {
    const units = resolveUnits(
      "GET https://api.example.com/1 HTTP/1.1\n\n###\nGET https://api.example.com/2 HTTP/1.1\n\n###\nGET https://api.example.com/3 HTTP/1.1",
    );

    const callOrder: number[] = [];
    const executor: ExecutionHttpExecutor = {
      execute: async (unit) => {
        callOrder.push(unit.requestIndex);
        return createExecutedUnit(unit);
      },
    };

    const orchestrator = new ExecutionOrchestrator({
      requestExecutionStrategy: "runInBand",
      executor,
      comparator: createComparator(() => ({ passed: true, strategy: "exact", mismatches: [] })),
    });

    const results = await orchestrator.execute(units);

    expect(callOrder).toEqual([0, 1, 2]);
    expect(results).toHaveLength(3);
    expect(results.every((result) => result.passed)).toBe(true);
    expect(results.every((result) => result.error === null)).toBe(true);
  });

  test("stops after first comparison failure when bail is 1", async () => {
    const units = resolveUnits(
      "GET https://api.example.com/1 HTTP/1.1\n\n###\nGET https://api.example.com/2 HTTP/1.1\n\n###\nGET https://api.example.com/3 HTTP/1.1",
    );

    const callOrder: number[] = [];
    const executor: ExecutionHttpExecutor = {
      execute: async (unit) => {
        callOrder.push(unit.requestIndex);
        return createExecutedUnit(unit);
      },
    };

    const comparator = createComparator((context) => ({
      passed: context.actualResponse.statusCode === 200 && context.expectedResponse !== undefined && context.expectedResponse !== null
        ? true
        : context.actualResponse.statusCode === 200,
      strategy: "exact",
      mismatches: context.actualResponse.statusCode === 200 ? [] : [],
    }));

    let comparisonCount = 0;
    const failingComparator = createComparator(() => {
      comparisonCount += 1;
      if (comparisonCount === 2) {
        return {
          passed: false,
          strategy: "exact",
          mismatches: [
            {
              field: "body",
              expected: "x",
              actual: "y",
              message: "mismatch",
            },
          ],
        };
      }

      return { passed: true, strategy: "exact", mismatches: [] };
    });

    const orchestrator = new ExecutionOrchestrator({
      requestExecutionStrategy: "runInBand",
      bail: 1,
      executor,
      comparator: failingComparator,
    });

    const results = await orchestrator.execute(units);

    expect(comparator).toBeDefined();
    expect(callOrder).toEqual([0, 1]);
    expect(results).toHaveLength(2);
    expect(results[0]?.passed).toBe(true);
    expect(results[1]?.passed).toBe(false);
    expect(results[1]?.comparison?.mismatches).toHaveLength(1);
  });

  test("continues after comparison failure when bail is disabled", async () => {
    const units = resolveUnits(
      "GET https://api.example.com/1 HTTP/1.1\n\n###\nGET https://api.example.com/2 HTTP/1.1\n\n###\nGET https://api.example.com/3 HTTP/1.1",
    );

    const callOrder: number[] = [];
    const executor: ExecutionHttpExecutor = {
      execute: async (unit) => {
        callOrder.push(unit.requestIndex);
        return createExecutedUnit(unit);
      },
    };

    let comparisonCount = 0;
    const comparator = createComparator(() => {
      comparisonCount += 1;
      if (comparisonCount === 2) {
        return {
          passed: false,
          strategy: "exact",
          mismatches: [
            {
              field: "statusCode",
              expected: 200,
              actual: 500,
              message: "mismatch",
            },
          ],
        };
      }

      return { passed: true, strategy: "exact", mismatches: [] };
    });

    const orchestrator = new ExecutionOrchestrator({
      requestExecutionStrategy: "runInBand",
      bail: null,
      executor,
      comparator,
    });

    const results = await orchestrator.execute(units);

    expect(callOrder).toEqual([0, 1, 2]);
    expect(results).toHaveLength(3);
    expect(results[1]?.passed).toBe(false);
    expect(results[2]?.passed).toBe(true);
  });

  test("stops on executor error when bail is 1", async () => {
    const units = resolveUnits(
      "GET https://api.example.com/1 HTTP/1.1\n\n###\nGET https://api.example.com/2 HTTP/1.1\n\n###\nGET https://api.example.com/3 HTTP/1.1",
    );

    const callOrder: number[] = [];
    const executor: ExecutionHttpExecutor = {
      execute: async (unit) => {
        callOrder.push(unit.requestIndex);
        if (unit.requestIndex === 1) {
          throw new Error("network failed");
        }
        return createExecutedUnit(unit);
      },
    };

    const orchestrator = new ExecutionOrchestrator({
      requestExecutionStrategy: "runInBand",
      bail: 1,
      executor,
      comparator: createComparator(() => ({ passed: true, strategy: "exact", mismatches: [] })),
    });

    const results = await orchestrator.execute(units);

    expect(callOrder).toEqual([0, 1]);
    expect(results).toHaveLength(2);
    expect(results[1]?.passed).toBe(false);
    expect(results[1]?.executedUnit).toBeNull();
    expect(results[1]?.comparison).toBeNull();
    expect(results[1]?.error?.message).toContain("network failed");
  });

  test("stops after configured number of failures when bail is greater than 1", async () => {
    const units = resolveUnits(
      "GET https://api.example.com/1 HTTP/1.1\n\n###\nGET https://api.example.com/2 HTTP/1.1\n\n###\nGET https://api.example.com/3 HTTP/1.1",
    );

    const callOrder: number[] = [];
    const executor: ExecutionHttpExecutor = {
      execute: async (unit) => {
        callOrder.push(unit.requestIndex);
        return createExecutedUnit(unit);
      },
    };

    let comparisonCount = 0;
    const comparator = createComparator(() => {
      comparisonCount += 1;
      return {
        passed: comparisonCount === 1,
        strategy: "exact",
        mismatches:
          comparisonCount === 1
            ? []
            : [{ field: "statusCode", expected: 200, actual: 500, message: "mismatch" }],
      };
    });

    const orchestrator = new ExecutionOrchestrator({
      requestExecutionStrategy: "runInBand",
      bail: 2,
      executor,
      comparator,
    });

    const results = await orchestrator.execute(units);

    expect(callOrder).toEqual([0, 1, 2]);
    expect(results).toHaveLength(3);
    expect(results[1]?.passed).toBe(false);
    expect(results[2]?.passed).toBe(false);
  });

  test("applies maxRequests limit before execution", async () => {
    const units = resolveUnits(
      "GET https://api.example.com/1 HTTP/1.1\n\n###\nGET https://api.example.com/2 HTTP/1.1\n\n###\nGET https://api.example.com/3 HTTP/1.1",
    );

    const callOrder: number[] = [];
    const executor: ExecutionHttpExecutor = {
      execute: async (unit) => {
        callOrder.push(unit.requestIndex);
        return createExecutedUnit(unit);
      },
    };

    const orchestrator = new ExecutionOrchestrator({
      requestExecutionStrategy: "runInBand",
      maxRequests: 2,
      executor,
      comparator: createComparator(() => ({ passed: true, strategy: "exact", mismatches: [] })),
    });

    const results = await orchestrator.execute(units);

    expect(callOrder).toEqual([0, 1]);
    expect(results).toHaveLength(2);
  });

  test("waits between requests based on defaultTimeBetweenRequests", async () => {
    const units = resolveUnits(
      "GET https://api.example.com/1 HTTP/1.1\n\n###\nGET https://api.example.com/2 HTTP/1.1\n\n###\nGET https://api.example.com/3 HTTP/1.1",
    );

    const sleepCalls: number[] = [];
    const executor: ExecutionHttpExecutor = {
      execute: async (unit) => createExecutedUnit(unit),
    };

    const orchestrator = new ExecutionOrchestrator({
      requestExecutionStrategy: "runInBand",
      defaultTimeBetweenRequests: 25,
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
      executor,
      comparator: createComparator(() => ({ passed: true, strategy: "exact", mismatches: [] })),
    });

    const results = await orchestrator.execute(units);

    expect(results).toHaveLength(3);
    expect(sleepCalls).toEqual([25, 25]);
  });

  test("streams each result through onResult callback", async () => {
    const units = resolveUnits(
      "GET https://api.example.com/1 HTTP/1.1\n\n###\nGET https://api.example.com/2 HTTP/1.1",
    );

    const observed: number[] = [];
    const executor: ExecutionHttpExecutor = {
      execute: async (unit) => createExecutedUnit(unit),
    };

    const orchestrator = new ExecutionOrchestrator({
      requestExecutionStrategy: "runInBand",
      executor,
      comparator: createComparator(() => ({ passed: true, strategy: "exact", mismatches: [] })),
    });

    const results = await orchestrator.execute(units, {
      onResult: async (result) => {
        observed.push(result.unit.requestIndex);
      },
    });

    expect(results).toHaveLength(2);
    expect(observed).toEqual([0, 1]);
  });

  test("executes concurrently when requestExecutionStrategy is concurrent", async () => {
    const units = resolveUnits(
      "GET https://api.example.com/1 HTTP/1.1\n\n###\nGET https://api.example.com/2 HTTP/1.1",
    );

    const starts: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const executor: ExecutionHttpExecutor = {
      execute: async (unit) => {
        starts.push(unit.requestIndex);
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return createExecutedUnit(unit);
      },
    };

    const orchestrator = new ExecutionOrchestrator({
      requestExecutionStrategy: "concurrent",
      executor,
      comparator: createComparator(() => ({ passed: true, strategy: "exact", mismatches: [] })),
    });

    const results = await orchestrator.execute(units);

    expect(results).toHaveLength(2);
    expect(starts.sort()).toEqual([0, 1]);
    expect(maxInFlight).toBeGreaterThan(1);
  });
});
