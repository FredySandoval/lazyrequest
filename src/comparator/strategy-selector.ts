import type {
  ComparisonStrategy,
  HttpHeader,
  StrategySelectionContext,
} from "../types/types.ts";

export class StrategySelector {
  select(context: StrategySelectionContext): ComparisonStrategy {
    const expected = context.expectedResponse;
    const actual = context.actualResponse;

    if (expected === null) {
      return "exact";
    }

    const expectedContentType = this.getHeaderValue(expected.headers, "content-type");
    const actualContentType = this.getHeaderValue(actual.headers, "content-type");

    if (
      this.isJsonContentType(expectedContentType) ||
      this.isJsonContentType(actualContentType) ||
      this.isJsonLikeBody(expected.body) ||
      this.isJsonLikeBody(actual.body)
    ) {
      return "json";
    }

    if (
      this.isHtmlContentType(expectedContentType) ||
      this.isHtmlContentType(actualContentType) ||
      this.hasWildcardPattern(expected.body)
    ) {
      return "partial";
    }

    return "exact";
  }

  private getHeaderValue(
    headers: readonly Pick<HttpHeader, "name" | "value">[],
    headerName: string,
  ): string | null {
    const name = headerName.toLowerCase();
    for (const header of headers) {
      if (header.name.toLowerCase() === name) {
        return header.value;
      }
    }
    return null;
  }

  private isJsonContentType(contentType: string | null): boolean {
    if (typeof contentType !== "string") {
      return false;
    }

    const normalized = contentType.toLowerCase();
    return normalized.includes("application/json") || normalized.includes("+json");
  }

  private isHtmlContentType(contentType: string | null): boolean {
    if (typeof contentType !== "string") {
      return false;
    }

    return contentType.toLowerCase().includes("text/html");
  }

  private isJsonLikeBody(body: unknown): boolean {
    if (body === null || body === undefined) {
      return false;
    }

    if (typeof body === "object") {
      return true;
    }

    if (typeof body !== "string") {
      return false;
    }

    const trimmed = body.trim();
    if (trimmed.length === 0) {
      return false;
    }

    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        JSON.parse(trimmed);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  private hasWildcardPattern(body: unknown): boolean {
    if (typeof body !== "string") {
      return false;
    }

    return body.includes("*");
  }
}

export default StrategySelector;
