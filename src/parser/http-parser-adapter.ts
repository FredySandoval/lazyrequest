import { parseHttp, type ParserOptions } from "@fredy-dev/http-parser";
import type { ParsedHttpSource, HttpParserAdapterOptions } from "../types/types.ts";

export class HttpParserAdapter {
  private readonly parserOptions?: ParserOptions;

  constructor(options: HttpParserAdapterOptions = {}) {
    this.parserOptions = options.parser;
  }

  parseInline(text: string, sourceName = "inline"): ParsedHttpSource {
    if (!this.isNonEmptyText(text)) {
      throw new Error("HTTP template text must be a non-empty string.");
    }

    const result = parseHttp(text, this.parserOptions);
    const ast = result.ast;
    if (ast.requests.length === 0) {
      throw new Error(`No HTTP requests found in inline source: ${sourceName}`);
    }

    return {
      sourceType: "inline",
      sourceName,
      ast,
    };
  }

  async parseFile(filePath: string): Promise<ParsedHttpSource> {
    if (!this.isNonEmptyText(filePath)) {
      throw new Error("File path must be a non-empty string.");
    }

    let text: string;
    try {
      text = await Bun.file(filePath).text();
    } catch (error) {
      throw new Error(
        `Failed to read HTTP file: ${filePath}. ${this.formatError(error)}`
      );
    }

    if (!this.isNonEmptyText(text)) {
      throw new Error(`HTTP file is empty: ${filePath}`);
    }

    const result = parseHttp(text, this.parserOptions);
    const ast = result.ast;
    if (ast.requests.length === 0) {
      throw new Error(`No HTTP requests found in file: ${filePath}`);
    }

    return {
      sourceType: "file",
      sourceName: filePath,
      filePath,
      ast,
    };
  }

  async parseFiles(filePaths: string[]): Promise<ParsedHttpSource[]> {
    if (!Array.isArray(filePaths)) {
      throw new Error("filePaths must be an array of file path strings.");
    }

    const normalized = filePaths.filter((filePath) =>
      this.isNonEmptyText(filePath)
    );

    if (normalized.length === 0) {
      return [];
    }

    return Promise.all(normalized.map((filePath) => this.parseFile(filePath)));
  }

  private isNonEmptyText(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
  }

  private formatError(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return "Unknown error";
  }
}
