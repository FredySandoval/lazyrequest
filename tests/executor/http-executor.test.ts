import { afterEach, describe, expect, test } from "bun:test";
import { HttpParserAdapter } from "../../src/parser/http-parser-adapter.ts";
import { VariableResolver } from "../../src/resolver/variable-resolver.ts";
import { HttpExecutor } from "../../src/executor/http-executor.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function resolveSingleRequest(http: string) {
  const adapter = new HttpParserAdapter();
  const resolver = new VariableResolver();
  const [unit] = resolver.resolveSource(adapter.parseInline(http, "executor-test"));

  if (!unit) {
    throw new Error("Expected one resolved request unit");
  }

  return unit;
}

describe("HttpExecutor", () => {
  test("executes request and normalizes JSON response body", async () => {
    globalThis.fetch = (async () => {
      return new Response('{"ok":true,"id":123}', {
        status: 201,
        statusText: "Created",
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const unit = resolveSingleRequest("GET https://api.example.com/users HTTP/1.1");
    const executor = new HttpExecutor({ timeout: 500 });

    const executed = await executor.execute(unit);

    expect(executed.response.statusCode).toBe(201);
    expect(executed.response.body).toEqual({ ok: true, id: 123 });
    expect(executed.response.rawBody).toBe('{"ok":true,"id":123}');
    expect(executed.request.method).toBe("GET");
    expect(executed.request.url).toBe("https://api.example.com/users");
  });

  test("merges default headers and allows request-level override", async () => {
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      return new Response("hello", {
        status: 200,
        headers: {
          "x-default": headers.get("x-default") ?? "",
          "x-request": headers.get("x-request") ?? "",
        },
      });
    }) as unknown as typeof fetch;

    const unit = resolveSingleRequest(
      "POST https://api.example.com/echo HTTP/1.1\nX-Request: block\n\nhello",
    );
    const executor = new HttpExecutor({
      timeout: 500,
      defaultHeaders: {
        "x-default": "default-value",
        "x-request": "default-request",
      },
    });

    const executed = await executor.execute(unit);
    const responseHeaders = new Map(
      executed.response.headers.map((header) => [header.name.toLowerCase(), header.value]),
    );

    expect(executed.request.body).toContain("hello");
    expect(responseHeaders.get("x-default")).toBe("default-value");
    expect(responseHeaders.get("x-request")).toBe("block");
    expect(executed.response.body).toBe("hello");
  });

  test("throws a timeout error when request exceeds timeout", async () => {
    globalThis.fetch = ((_: unknown, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    }) as unknown as typeof fetch;

    const unit = resolveSingleRequest("GET https://api.example.com/slow HTTP/1.1");
    const executor = new HttpExecutor({ timeout: 20 });

    await expect(executor.execute(unit)).rejects.toThrow("Request timed out after 20ms");
  });
});
