import { StrategySelector } from "./strategy-selector.ts";
import type {
  ComparisonStrategy,
  HttpHeader,
  ResponseComparisonContext,
  ResponseComparisonMismatch,
  ResponseComparisonResult,
} from "../types/types.ts";

export class ResponseComparator {
  private static readonly DEFAULT_EXPECTED_STATUS_CODE = 200;
  private readonly strategySelector: StrategySelector;

  constructor(strategySelector = new StrategySelector()) {
    this.strategySelector = strategySelector;
  }

  compare(context: ResponseComparisonContext): ResponseComparisonResult {
    const expected = context.expectedResponse;

    if (expected === null) {
      const mismatches: ResponseComparisonMismatch[] = [];
      this.compareStatus(
        ResponseComparator.DEFAULT_EXPECTED_STATUS_CODE,
        context.actualResponse.statusCode,
        mismatches,
      );

      return {
        passed: mismatches.length === 0,
        strategy: context.strategy ?? "exact",
        mismatches,
      };
    }

    const strategy =
      context.strategy ??
      this.strategySelector.select({
        expectedResponse: expected,
        actualResponse: context.actualResponse,
      });

    const mismatches: ResponseComparisonMismatch[] = [];

    this.compareStatus(expected.statusCode, context.actualResponse.statusCode, mismatches);
    this.compareStatusText(expected.statusText, context.actualResponse.statusText, mismatches);
    this.compareHeaders(expected.headers, context.actualResponse.headers, mismatches);
    this.compareBody(strategy, expected.body, context.actualResponse.body, mismatches);

    return {
      passed: mismatches.length === 0,
      strategy,
      mismatches,
    };
  }

  private compareStatus(
    expectedStatusCode: number,
    actualStatusCode: number,
    mismatches: ResponseComparisonMismatch[],
  ): void {
    if (expectedStatusCode <= 0) {
      return;
    }

    if (expectedStatusCode !== actualStatusCode) {
      mismatches.push({
        field: "statusCode",
        expected: expectedStatusCode,
        actual: actualStatusCode,
        message: `Expected status code ${expectedStatusCode}, received ${actualStatusCode}.`,
      });
    }
  }

  private compareStatusText(
    expectedStatusText: string | null,
    actualStatusText: string,
    mismatches: ResponseComparisonMismatch[],
  ): void {
    if (expectedStatusText === null) {
      return;
    }

    if (expectedStatusText !== actualStatusText) {
      mismatches.push({
        field: "statusText",
        expected: expectedStatusText,
        actual: actualStatusText,
        message: `Expected status text "${expectedStatusText}", received "${actualStatusText}".`,
      });
    }
  }

  private compareHeaders(
    expectedHeaders: readonly Pick<HttpHeader, "name" | "value">[],
    actualHeaders: readonly Pick<HttpHeader, "name" | "value">[],
    mismatches: ResponseComparisonMismatch[],
  ): void {
    if (expectedHeaders.length === 0) {
      return;
    }

    const actualMap = new Map<string, string>();
    for (const header of actualHeaders) {
      actualMap.set(header.name.toLowerCase(), header.value);
    }

    for (const expectedHeader of expectedHeaders) {
      const normalizedHeaderName = expectedHeader.name.toLowerCase();
      const actualValue = actualMap.get(normalizedHeaderName);

      if (actualValue === undefined) {
        mismatches.push({
          field: `headers.${normalizedHeaderName}`,
          expected: expectedHeader.value,
          actual: null,
          message: `Expected header "${expectedHeader.name}" to be present.`,
        });
        continue;
      }

      if (actualValue !== expectedHeader.value) {
        mismatches.push({
          field: `headers.${normalizedHeaderName}`,
          expected: expectedHeader.value,
          actual: actualValue,
          message: `Expected header "${expectedHeader.name}" value "${expectedHeader.value}", received "${actualValue}".`,
        });
      }
    }
  }

  private compareBody(
    strategy: ComparisonStrategy,
    expectedBody: unknown,
    actualBody: unknown,
    mismatches: ResponseComparisonMismatch[],
  ): void {
    if (expectedBody === null || expectedBody === undefined || expectedBody === "") {
      return;
    }

    if (strategy === "json") {
      this.compareJsonBody(expectedBody, actualBody, mismatches);
      return;
    }

    if (strategy === "partial") {
      this.comparePartialBody(expectedBody, actualBody, mismatches);
      return;
    }

    this.compareExactBody(expectedBody, actualBody, mismatches);
  }

  private compareJsonBody(
    expectedBody: unknown,
    actualBody: unknown,
    mismatches: ResponseComparisonMismatch[],
  ): void {
    const expectedJson = this.toJsonComparable(expectedBody);
    const actualJson = this.toJsonComparable(actualBody);

    if (expectedJson === undefined || actualJson === undefined) {
      mismatches.push({
        field: "body",
        expected: expectedBody,
        actual: actualBody,
        message: "JSON comparison failed because one of the bodies is not valid JSON-compatible content.",
      });
      return;
    }

    if (!this.deepEqual(expectedJson, actualJson)) {
      mismatches.push({
        field: "body",
        expected: expectedJson,
        actual: actualJson,
        message: "JSON body does not match expected structure/value.",
      });
    }
  }

  private compareExactBody(
    expectedBody: unknown,
    actualBody: unknown,
    mismatches: ResponseComparisonMismatch[],
  ): void {
    const expectedText = this.toComparableText(expectedBody);
    const actualText = this.toComparableText(actualBody);

    if (expectedText !== actualText) {
      mismatches.push({
        field: "body",
        expected: expectedText,
        actual: actualText,
        message: "Response body does not match expected exact value.",
      });
    }
  }

  private comparePartialBody(
    expectedBody: unknown,
    actualBody: unknown,
    mismatches: ResponseComparisonMismatch[],
  ): void {
    const expectedText = this.toComparableText(expectedBody);
    const actualText = this.toComparableText(actualBody);

    if (expectedText.includes("*")) {
      const pattern = this.wildcardToRegExp(expectedText);
      if (!pattern.test(actualText)) {
        mismatches.push({
          field: "body",
          expected: expectedText,
          actual: actualText,
          message: "Response body does not match expected wildcard pattern.",
        });
      }
      return;
    }

    if (!actualText.includes(expectedText)) {
      mismatches.push({
        field: "body",
        expected: expectedText,
        actual: actualText,
        message: "Response body does not contain expected partial content.",
      });
    }
  }

  private toComparableText(value: unknown): string {
    if (value === null || value === undefined) {
      return "";
    }

    if (typeof value === "string") {
      return value;
    }

    return this.stableStringify(value);
  }

  private toJsonComparable(value: unknown): unknown | undefined {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === "object") {
      return value;
    }

    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return undefined;
    }
  }

  private deepEqual(left: unknown, right: unknown): boolean {
    return this.stableStringify(left) === this.stableStringify(right);
  }

  private stableStringify(value: unknown): string {
    if (value === null || value === undefined) {
      return String(value);
    }

    if (typeof value !== "object") {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((entry) => this.stableStringify(entry)).join(",")}]`;
    }

    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${this.stableStringify(record[key])}`);
    return `{${entries.join(",")}}`;
  }

  private wildcardToRegExp(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const regexSource = `^${escaped.split("*").join(".*")}$`;
    return new RegExp(regexSource, "s");
  }
}

export default ResponseComparator;
