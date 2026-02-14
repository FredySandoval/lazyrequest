import { describe, expect, test } from "bun:test";
import { HttpParserAdapter } from "../../src/parser/http-parser-adapter.ts";
import { VariableResolver } from "../../src/resolver/variable-resolver.ts";
import { ResponseComparator } from "../../src/comparator/response-comparator.ts";
import type { ExecutedHttpResponse } from "../../src/types/types.ts";

function createExpectedResponse(http: string) {
  const adapter = new HttpParserAdapter();
  const resolver = new VariableResolver();
  const [unit] = resolver.resolveSource(adapter.parseInline(http, "response-comparator-test"));
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

describe("ResponseComparator", () => {
  test("passes when expected response is null and actual status code is 200", () => {
    const comparator = new ResponseComparator();
    const result = comparator.compare({
      expectedResponse: null,
      actualResponse: createActualResponse(),
    });

    expect(result.passed).toBe(true);
    expect(result.mismatches).toHaveLength(0);
  });

  test("fails when expected response is null and actual status code is not 200", () => {
    const comparator = new ResponseComparator();
    const result = comparator.compare({
      expectedResponse: null,
      actualResponse: createActualResponse({ statusCode: 404 }),
    });

    expect(result.passed).toBe(false);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0]?.field).toBe("statusCode");
    expect(result.mismatches[0]?.expected).toBe(200);
    expect(result.mismatches[0]?.actual).toBe(404);
  });

  test("fails when status code is different", () => {
    const comparator = new ResponseComparator();
    const expectedResponse = createExpectedResponse(
      `GET https://api.example.com/users HTTP/1.1

###
HTTP/1.1 201 Created`,
    );

    const result = comparator.compare({
      expectedResponse,
      actualResponse: createActualResponse({ statusCode: 200 }),
    });

    expect(result.passed).toBe(false);
    expect(result.mismatches.some((mismatch) => mismatch.field === "statusCode")).toBe(true);
  });

  test("fails when expected header value does not match", () => {
    const comparator = new ResponseComparator();
    const expectedResponse = createExpectedResponse(
      `GET https://api.example.com/users HTTP/1.1

###
HTTP/1.1 200 OK
Content-Type: application/json`,
    );

    const result = comparator.compare({
      expectedResponse,
      actualResponse: createActualResponse({
        headers: [{ name: "content-type", value: "text/plain" }],
      }),
    });

    expect(result.passed).toBe(false);
    expect(
      result.mismatches.some((mismatch) => mismatch.field === "headers.content-type"),
    ).toBe(true);
  });

  test("compares JSON body using deep structure equality", () => {
    const comparator = new ResponseComparator();
    const expectedResponse = createExpectedResponse(
      `GET https://api.example.com/users HTTP/1.1

###
HTTP/1.1 200 OK
Content-Type: application/json

{"id":1,"profile":{"name":"Alice"}}`,
    );

    const passResult = comparator.compare({
      expectedResponse,
      actualResponse: createActualResponse({
        headers: [{ name: "content-type", value: "application/json" }],
        body: { profile: { name: "Alice" }, id: 1 },
      }),
    });

    const failResult = comparator.compare({
      expectedResponse,
      actualResponse: createActualResponse({
        headers: [{ name: "content-type", value: "application/json" }],
        body: { profile: { name: "Bob" }, id: 1 },
      }),
    });

    expect(passResult.passed).toBe(true);
    expect(failResult.passed).toBe(false);
    expect(failResult.mismatches.some((mismatch) => mismatch.field === "body")).toBe(true);
  });

  test("supports wildcard matching for partial strategy", () => {
    const comparator = new ResponseComparator();
    const expectedResponse = createExpectedResponse(
      `GET https://api.example.com/page HTTP/1.1

###
HTTP/1.1 200 OK
Content-Type: text/html

<html>*hello*</html>`,
    );

    const passResult = comparator.compare({
      expectedResponse,
      actualResponse: createActualResponse({
        headers: [{ name: "content-type", value: "text/html" }],
        body: "<html><body>say hello world</body></html>",
      }),
    });

    const failResult = comparator.compare({
      expectedResponse,
      actualResponse: createActualResponse({
        headers: [{ name: "content-type", value: "text/html" }],
        body: "<html><body>goodbye</body></html>",
      }),
    });

    expect(passResult.passed).toBe(true);
    expect(failResult.passed).toBe(false);
  });
});
