import path from "node:path";
import type {
  ExecutionResult,
  ResultReport,
  ResultReporterOptions,
  ResultReporterOutput,
  ResultSummaryOptions,
  ResponseComparisonMismatch,
} from "../types/types.ts";

const defaultOutput: ResultReporterOutput = {
  info: (message) => console.log(message),
  error: (message) => console.error(message),
};

export class ResultReporter {
  private readonly verbose: boolean;
  private readonly output: ResultReporterOutput;
  private readonly useColors: boolean;
  private bannerPrinted = false;
  private readonly printedSources = new Set<string>();

  constructor(options: ResultReporterOptions = {}) {
    this.verbose = options.verbose ?? false;
    this.output = options.output ?? defaultOutput;
    this.useColors = Boolean(process.stdout?.isTTY);
  }

  report(results: readonly ExecutionResult[]): ResultReport {
    this.printBanner();
    for (const result of results) {
      this.reportResult(result);
    }

    return this.reportSummary(results);
  }

  reportResult(result: ExecutionResult): void {
    this.printBanner();
    this.printSourceHeader(result.unit.sourceName);

    if (result.passed) {
      this.output.info(this.formatPassLine(result));
      return;
    }

    this.output.error(this.formatFailLine(result));

    if (result.error) {
      this.output.error(`  error: ${result.error.message}`);
      return;
    }

    const mismatches = result.comparison?.mismatches ?? [];
    for (const mismatch of mismatches) {
      this.output.error(`  - ${this.formatMismatch(mismatch)}`);
    }
  }

  reportSummary(
    results: readonly ExecutionResult[],
    options: ResultSummaryOptions = {},
  ): ResultReport {
    this.printBanner();
    const startedAtMs = options.startedAtMs ?? Date.now();
    let passed = 0;
    let failed = 0;
    let errors = 0;

    for (const result of results) {
      if (result.passed) {
        passed += 1;
        continue;
      }

      failed += 1;
      if (result.error) {
        errors += 1;
      }
    }

    const summary = {
      total: results.length,
      passed,
      failed,
      errors,
      durationMs: Math.max(0, Date.now() - startedAtMs),
    } as const;

    const uniqueSources = new Set(results.map((result) => result.unit.sourceName));
    const fileWord = uniqueSources.size === 1 ? "file" : "files";
    this.output.info("");
    this.output.info(` ${this.color("green", `${summary.passed} pass`)}`);
    const failColor = summary.failed > 0 ? "red" : "gray";
    this.output.info(` ${this.color(failColor, `${summary.failed} fail`)}`);
    if (summary.errors > 0) {
      this.output.info(` ${summary.errors} error`);
    }
    this.output.info([
      this.color("white", `Ran ${summary.total} requests across ${uniqueSources.size} ${fileWord}.`),
      this.color("gray", `[${this.formatDuration(summary.durationMs)}]`),
    ].join(" "));

    if (this.verbose && summary.total === 0) {
      this.output.info("No requests were executed.");
    }

    return {
      summary,
      exitCode: summary.failed > 0 ? 1 : 0,
    };
  }

  private formatPassLine(result: ExecutionResult): string {
    const label = this.getRequestLabel(result);
    const durationMs = result.executedUnit?.response.durationMs ?? 0;
    return `${this.color("green", "✓")} ${label} ${this.color("gray", `[${this.formatDuration(durationMs)}]`)}`;
  }

  private formatFailLine(result: ExecutionResult): string {
    const label = this.getRequestLabel(result);
    const durationMs = result.executedUnit?.response.durationMs ?? 0;
    return `${this.color("red", "✗")} ${label} ${this.color("gray", `[${this.formatDuration(durationMs)}]`)}`;
  }

  private getRequestLabel(result: ExecutionResult): string {
    const request = result.executedUnit?.request ?? result.unit.request;
    const name =
      result.executedUnit?.requestName ??
      result.unit.request.name ??
      `request-${result.unit.requestIndex + 1}`;
    const methodAndUrl = this.color("boldWhite", `${request.method} ${request.url}`);
    return `${name} ${this.color("gray", ">")} ${methodAndUrl}`;
  }

  private formatMismatch(mismatch: ResponseComparisonMismatch): string {
    return `${mismatch.field}: ${mismatch.message} (expected=${this.stringifyValue(mismatch.expected)}, actual=${this.stringifyValue(mismatch.actual)})`;
  }

  private stringifyValue(value: unknown): string {
    if (value === null || value === undefined) {
      return String(value);
    }

    if (typeof value === "string") {
      return JSON.stringify(value);
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private printBanner(): void {
    if (this.bannerPrinted) {
      return;
    }

    this.output.info("lazyrequest");
    this.bannerPrinted = true;
  }

  private printSourceHeader(sourceName: string): void {
    if (this.printedSources.has(sourceName)) {
      return;
    }

    this.output.info("");
    this.output.info(`${this.formatSourceName(sourceName)}:`);
    this.printedSources.add(sourceName);
  }

  private formatDuration(durationMs: number): string {
    return `${durationMs.toFixed(2)}ms`;
  }

  private formatSourceName(sourceName: string): string {
    if (!path.isAbsolute(sourceName)) {
      return sourceName;
    }

    const relativePath = path.relative(process.cwd(), sourceName);
    if (!relativePath) {
      return ".";
    }

    return relativePath.split(path.sep).join("/");
  }

  private color(kind: "green" | "red" | "gray" | "boldWhite" | "white", text: string): string {
    if (!this.useColors) {
      return text;
    }

    const code =
      kind === "green"
        ? "\x1b[32m"
        : kind === "red"
          ? "\x1b[31m"
          : kind === "gray"
            ? "\x1b[90m"
            : kind === "boldWhite"
              ? "\x1b[1;37m"
              : "\x1b[37m";
    return `${code}${text}\x1b[0m`;
  }
}

export default ResultReporter;
