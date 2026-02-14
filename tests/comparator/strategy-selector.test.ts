import { describe, expect, test } from "bun:test";
import { HttpParserAdapter } from "../../src/parser/http-parser-adapter.ts";
import { VariableResolver } from "../../src/resolver/variable-resolver.ts";
import { StrategySelector } from "../../src/comparator/strategy-selector.ts";
import type { ExecutedHttpResponse } from "../../src/types/types.ts";

function createExpectedResponse(http: string) {
  const adapter = new HttpParserAdapter();
  const resolver = new VariableResolver();
  const [unit] = resolver.resolveSource(adapter.parseInline(http, "strategy-selector-test"));
  const expectedResponse = unit?.request.expectedResponse;

  if (!expectedResponse) {
    throw new Error("Expected response block is required for this test");
  }

  return expectedResponse;
}

function createActualResponse(
  overrides: Partial<ExecutedHttpResponse> = {},
): ExecutedHttpResponse {
  return {
    statusCode: overrides.statusCode ?? 200,
    statusText: overrides.statusText ?? "OK",
    headers: overrides.headers ?? [],
    body: overrides.body ?? "",
    rawBody: overrides.rawBody ?? "",
    durationMs: overrides.durationMs ?? 1,
  };
}

describe("StrategySelector", () => {
  test("selects json strategy when content-type is json", () => {
    const selector = new StrategySelector();
    const expectedResponse = createExpectedResponse(
      `GET https://api.example.com/users HTTP/1.1

###
HTTP/1.1 200 OK
Content-Type: application/json

{"id":1}`,
    );

    const strategy = selector.select({
      expectedResponse,
      actualResponse: createActualResponse(),
    });

    expect(strategy).toBe("json");
  });

  test("selects partial strategy for html content", () => {
    const selector = new StrategySelector();
    const expectedResponse = createExpectedResponse(
      `GET https://api.example.com/page HTTP/1.1

###
HTTP/1.1 200 OK
Content-Type: text/html

<html><body>Hello</body></html>`,
    );

    const strategy = selector.select({
      expectedResponse,
      actualResponse: createActualResponse(),
    });

    expect(strategy).toBe("partial");
  });

  test("selects partial strategy when expected body contains wildcard", () => {
    const selector = new StrategySelector();
    const expectedResponse = createExpectedResponse(
      `GET https://api.example.com/users HTTP/1.1

###
HTTP/1.1 200 OK
Content-Type: text/plain

hello * world`,
    );

    const strategy = selector.select({
      expectedResponse,
      actualResponse: createActualResponse(),
    });

    expect(strategy).toBe("partial");
  });

  test("falls back to exact strategy for plain text", () => {
    const selector = new StrategySelector();
    const expectedResponse = createExpectedResponse(
      `GET https://api.example.com/users HTTP/1.1

###
HTTP/1.1 200 OK
Content-Type: text/plain

exact-value`,
    );

    const strategy = selector.select({
      expectedResponse,
      actualResponse: createActualResponse(),
    });

    expect(strategy).toBe("exact");
  });
});
