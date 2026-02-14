import { describe, expect, test } from "bun:test";
import { HttpParserAdapter } from "../../src/parser/http-parser-adapter";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.resolve(__dirname, "../fixtures/http-parser");
const sampleFile = path.join(fixtureDir, "sample.http");
const sampleTwoRequestsFile = path.join(fixtureDir, "sample2.http");
const sampleTwoRequestsWithSharedVarsFile = path.join(fixtureDir, "sample3.http");

describe("HttpParserAdapter", () => {
  test("parseInline parses one request and keeps source metadata", () => {
    const adapter = new HttpParserAdapter();
    const parsed = adapter.parseInline(
      "GET https://example.com/users HTTP/1.1",
      "inline-source"
    );
    expect(parsed.sourceType).toBe("inline");
    expect(parsed.sourceName).toBe("inline-source");
    expect(parsed.ast.requests.length).toBe(1);
    expect(parsed.ast.requests[0]?.method).toBe("GET");
    expect(parsed.ast.requests[0]?.url).toBe("https://example.com/users");
  });

  test("parseInline throws for empty text", () => {
    const adapter = new HttpParserAdapter();
    expect(() => adapter.parseInline("   ")).toThrow(
      "HTTP template text must be a non-empty string."
    );
  });

  test("parseFile parses sample fixture and returns file source metadata", async () => {
    const adapter = new HttpParserAdapter();
    const parsed = await adapter.parseFile(sampleFile);

    expect(parsed.sourceType).toBe("file");
    expect(parsed.sourceName).toBe(sampleFile);
    if (parsed.sourceType !== "file") {
      throw new Error("Expected file source");
    }
    expect(parsed.filePath).toBe(sampleFile);
    expect(parsed.ast.requests.length).toBe(1);
    expect(parsed.ast.requests[0]?.method).toBe("GET");
    expect(parsed.ast.requests[0]?.url).toBe("{{baseUrl}}/fixtures/http-parser/sample");
  });

  test("parseFile throws for missing path", async () => {
    const adapter = new HttpParserAdapter();
    await expect(adapter.parseFile("")).rejects.toThrow(
      "File path must be a non-empty string."
    );
  });

  test("parseFile throws for non-existing file", async () => {
    const adapter = new HttpParserAdapter();
    const missingFile = path.join(fixtureDir, "missing.http");
    await expect(adapter.parseFile(missingFile)).rejects.toThrow(
      `Failed to read HTTP file: ${missingFile}.`
    );
  });

  test("parseFile throws for empty file content", async () => {
    const adapter = new HttpParserAdapter();
    const tempFile = path.join(
      fixtureDir,
      `__temp_empty_${Date.now()}_${Math.random().toString(16).slice(2)}.http`
    );

    try {
      await Bun.write(tempFile, "   ");
      await expect(adapter.parseFile(tempFile)).rejects.toThrow(
        `HTTP file is empty: ${tempFile}`
      );
    } finally {
      await Bun.file(tempFile).delete();
    }
  });

  test("parseFiles parses multiple files and filters empty entries", async () => {
    const adapter = new HttpParserAdapter();
    const parsed = await adapter.parseFiles([
      sampleTwoRequestsFile,
      "",
      "   ",
      sampleTwoRequestsWithSharedVarsFile,
    ]);

    expect(parsed.length).toBe(2);
    expect(parsed[0]?.sourceName).toBe(sampleTwoRequestsFile);
    expect(parsed[1]?.sourceName).toBe(sampleTwoRequestsWithSharedVarsFile);
    expect(parsed[0]?.ast.requests.length).toBe(2);
    expect(parsed[1]?.ast.requests.length).toBe(2);
  });

  test("parseFiles returns empty array for empty input", async () => {
    const adapter = new HttpParserAdapter();
    await expect(adapter.parseFiles([])).resolves.toEqual([]);
  });
});
