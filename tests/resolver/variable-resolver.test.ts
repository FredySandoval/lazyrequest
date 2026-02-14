import { describe, expect, test } from "bun:test";
import { HttpParserAdapter } from "../../src/parser/http-parser-adapter";
import { VariableResolver } from "../../src/resolver/variable-resolver";

describe("VariableResolver", () => {
  test("resolves file-level variables and applies block overrides only within block scope", () => {
    const adapter = new HttpParserAdapter();
    const source = adapter.parseInline(
      `@host = api.example.com
@scheme = https
@baseUrl = {{scheme}}://{{host}}

###
GET {{baseUrl}}/users HTTP/1.1
Authorization: Bearer {{token}}

###
@host = localhost:3000
@token = local-token
GET {{baseUrl}}/health HTTP/1.1
Authorization: Bearer {{token}}`,
      "inline-vars",
    );

    const resolver = new VariableResolver();
    const units = resolver.resolveSource(source);

    const usersRequest = units.find((unit) => unit.request.url.endsWith("/users"));
    const healthRequest = units.find((unit) => unit.request.url.endsWith("/health"));

    expect(usersRequest?.sourceType).toBe("inline");
    expect(usersRequest?.request.url).toBe("https://api.example.com/users");
    expect(usersRequest?.request.headers.find((h) => h.name === "Authorization")?.value).toBe(
      "Bearer {{token}}",
    );

    expect(healthRequest?.request.url).toBe("https://localhost:3000/health");
    expect(healthRequest?.request.headers.find((h) => h.name === "Authorization")?.value).toBe(
      "Bearer local-token",
    );
  });

  test("supports recursive interpolation across multiple passes", () => {
    const adapter = new HttpParserAdapter();
    const source = adapter.parseInline(
      `@apiHost = example.com
@base = https://{{apiHost}}
@usersPath = {{base}}/users
GET {{usersPath}} HTTP/1.1`,
      "recursive-inline",
    );

    const resolver = new VariableResolver({ maxInterpolationPasses: 10 });
    const [unit] = resolver.resolveSource(source);

    expect(unit?.request.url).toBe("https://example.com/users");
  });

  test("preserves unresolved variables by default", () => {
    const adapter = new HttpParserAdapter();
    const source = adapter.parseInline("GET https://api.example.com/{{missing}} HTTP/1.1");

    const resolver = new VariableResolver();
    const [unit] = resolver.resolveSource(source);

    expect(unit?.request.url).toBe("https://api.example.com/{{missing}}");
  });

  test("throws on unresolved variables when configured", () => {
    const adapter = new HttpParserAdapter();
    const source = adapter.parseInline("GET https://api.example.com/{{missing}} HTTP/1.1");

    const resolver = new VariableResolver({ throwOnUnresolved: true });

    expect(() => resolver.resolveSource(source)).toThrow("Unresolved variable: {{missing}}");
  });

  test("resolves placeholders inside expected response headers and body", () => {
    const adapter = new HttpParserAdapter();
    const source = adapter.parseInline(
      `@id = 123
@baseUrl = https://api.example.com

###
GET {{baseUrl}}/users/{{id}} HTTP/1.1

###
@location = {{baseUrl}}/users/{{id}}
HTTP/1.1 200 OK
Location: {{location}}
Content-Type: application/json

{"id":"{{id}}","url":"{{location}}"}`,
      "with-expected-response",
    );

    const resolver = new VariableResolver();
    const units = resolver.resolveSource(source);
    const unitWithExpected = units.find((unit) => unit.request.expectedResponse !== null);
    const expected = unitWithExpected?.request.expectedResponse;
    expect(expected).not.toBeNull();
    expect(expected?.headers.find((h) => h.name === "Location")?.value).toBe(
      "https://api.example.com/users/123",
    );

    expect(typeof expected?.body).toBe("string");
    const body = expected?.body as string;
    expect(body).toContain('\"id\":\"123\"');
    expect(body).toContain('\"url\":\"https://api.example.com/users/123\"');
  });

  test("does not mutate the original parsed source", () => {
    const adapter = new HttpParserAdapter();
    const source = adapter.parseInline(
      `@baseUrl = https://api.example.com
GET {{baseUrl}}/users HTTP/1.1`,
      "immutability",
    );

    const originalUrl = source.ast.requests[0]?.url;
    const resolver = new VariableResolver();
    const [unit] = resolver.resolveSource(source);

    expect(originalUrl).toBe("{{baseUrl}}/users");
    expect(source.ast.requests[0]?.url).toBe("{{baseUrl}}/users");
    expect(unit?.request.url).toBe("https://api.example.com/users");
  });

  test("resolveSources flattens multiple parsed sources", () => {
    const adapter = new HttpParserAdapter();
    const first = adapter.parseInline(
      `@baseUrl = https://a.example.com
GET {{baseUrl}}/one HTTP/1.1`,
      "source-a",
    );
    const second = adapter.parseInline(
      `@baseUrl = https://b.example.com
GET {{baseUrl}}/two HTTP/1.1`,
      "source-b",
    );

    const resolver = new VariableResolver();
    const units = resolver.resolveSources([first, second]);

    expect(units).toHaveLength(2);
    expect(units[0]?.sourceName).toBe("source-a");
    expect(units[0]?.request.url).toBe("https://a.example.com/one");
    expect(units[1]?.sourceName).toBe("source-b");
    expect(units[1]?.request.url).toBe("https://b.example.com/two");
  });

  test("applies scoped block variable only to the block where it is defined", () => {
    const adapter = new HttpParserAdapter();
    const source = adapter.parseInline(
      `@baseUrl = http://localhost:8080
@contentType = application/json

###
GET {{baseUrl}}/returns200sample03 HTTP/1.1

###
# Scoped variable example
@baseUrl = http://localhost:8080/scoped
GET {{baseUrl}}/returns200sample03 HTTP/1.1

###
GET {{baseUrl}}/returns200sample03 HTTP/1.1`,
      "scoped-variable-inline",
    );

    const resolver = new VariableResolver();
    const units = resolver.resolveSource(source);

    expect(units).toHaveLength(3);
    expect(units[0]?.request.url).toBe("http://localhost:8080/returns200sample03");
    expect(units[1]?.request.url).toBe("http://localhost:8080/scoped/returns200sample03");
    expect(units[2]?.request.url).toBe("http://localhost:8080/returns200sample03");
  });
});
