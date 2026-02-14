/**
 * Type definitions for parsed HTTP templates
 */

import type { ParseResult, ParserOptions } from "@fredy-dev/http-parser";

export type ExecutionMode = "inline" | "single-file" | "folder";
export type RequestExecutionStrategy = "runInBand" | "concurrent";
export type SourceType = "inline" | "file";
export type HttpAst = ParseResult["ast"];
export type HttpRequest = HttpAst["requests"][number];

export interface ParsedArgs {
  readonly http: string | undefined;
  readonly httpFile: string | undefined;
  readonly httpFolder: string | undefined;
  readonly timeout: number;
  readonly verbose: boolean;
  readonly bail: number | null;
  readonly runInBand: boolean;
  readonly concurrent: boolean;
  readonly showAfterDone: boolean;
}

/**
 * Fully normalized, validated runtime configuration.
 * No other part of the system should read CLI args or env vars directly.
 */
interface RuntimeConfigShared {
  /**
   * Request timeout in milliseconds.
   * Guaranteed > 0 and already validated.
   */
  readonly timeout: number;

  /**
   * Default delay between consecutive requests in milliseconds.
   * Used to throttle execution speed.
   * Guaranteed >= 0.
   * This value can be overridden per-request via special template syntax.
   */
  readonly defaultTimeBetweenRequests: number;

  /**
   * Enables verbose logging across the app.
   * Used by Logger and possibly Reporter.
   */
  readonly verbose: boolean;

  /**
   * Stop execution after N failed requests.
   * Null means never stop early.
   */
  readonly bail: number | null;
  readonly requestExecutionStrategy: RequestExecutionStrategy;
  readonly showAfterDone: boolean;

  /**
   * Headers automatically added to every outgoing request
   * unless explicitly overridden by the template.
   * Header names should be stored in normalized (lowercase) form.
   */
  readonly defaultHeaders: Readonly<Record<string, string>>;

  /**
   * Glob patterns for files/folders to ignore during discovery.
   */
  ignorePaths: string[];

  /**
   * Maximum number of requests to execute.
   * Safety guard to prevent accidental huge runs.
   * Null = unlimited.
   */
  readonly maxRequests: number | null;

  /**
   * Maximum folder recursion depth when searching for files.
   * Null = unlimited.
   */
  readonly maxDepth: number | null;
}

export interface InlineRuntimeConfig extends RuntimeConfigShared {
  /**
   * Determines how requests are sourced.
   * - "inline"      → single HTTP template provided via CLI flag
   */
  readonly executionMode: "inline";

  /**
   * Absolute paths used for file discovery.
   * Empty when executionMode === "inline".
   */
  readonly searchPaths: [];
  /**
   * Raw HTTP template text when using --http inline mode.
   * Present only for inline mode.
   */
  readonly inlineHttpText: string;
}

export interface SingleFileRuntimeConfig extends RuntimeConfigShared {
  /**
   * Determines how requests are sourced.
   * - "single-file" → exactly one .http/.rest file
   */
  readonly executionMode: "single-file";

  /**
   * Absolute paths used for file discovery.
   * Contains exactly one file path in single-file mode.
   */
  readonly searchPaths: [string];

  /**
   * Raw HTTP template text when using --http inline mode.
   * Null for file/folder modes.
   */
  readonly inlineHttpText: null;
}

export interface FolderRuntimeConfig extends RuntimeConfigShared {
  /**
   * Determines how requests are sourced.
   * - "folder" → recursive scan of folders
   */
  readonly executionMode: "folder";

  /**
   * Absolute paths used for file discovery.
   * Contains 1+ directory paths in folder mode.
   */
  readonly searchPaths: [string, ...string[]];

  /**
   * Raw HTTP template text when using --http inline mode.
   * Null for file/folder modes.
   */
  readonly inlineHttpText: null;
}

export type RuntimeConfig =
  | InlineRuntimeConfig
  | SingleFileRuntimeConfig
  | FolderRuntimeConfig;

/**
 * File Discovery Result containing discovered files and metadata.
 */
export interface DiscoveryResult {
  files: string[];
  mode: ExecutionMode;
  totalFound: number;
}

export interface InlineParsedHttpSource {
  readonly sourceType: "inline";
  readonly sourceName: string;
  readonly ast: HttpAst;
}

export interface FileParsedHttpSource {
  readonly sourceType: "file";
  readonly sourceName: string;
  readonly filePath: string;
  readonly ast: HttpAst;
}

export type ParsedHttpSource = InlineParsedHttpSource | FileParsedHttpSource;

export interface HttpParserAdapterOptions {
  readonly parser?: ParserOptions;
}

export interface VariableResolverOptions {
  readonly maxInterpolationPasses?: number;
  readonly throwOnUnresolved?: boolean;
}

interface ResolvedRequestUnitBase {
  readonly sourceName: string;
  readonly requestIndex: number;
  readonly request: HttpRequest;
}

export interface ResolvedInlineRequestUnit extends ResolvedRequestUnitBase {
  readonly sourceType: "inline";
}

export interface ResolvedFileRequestUnit extends ResolvedRequestUnitBase {
  readonly sourceType: "file";
  readonly filePath: string;
}

export type ResolvedHttpRequestUnit =
  | ResolvedInlineRequestUnit
  | ResolvedFileRequestUnit;

export interface HttpExecutorOptions {
  readonly timeout: number;
  readonly defaultHeaders?: Readonly<Record<string, string>>;
}

export interface HttpHeader {
  readonly name: string;
  readonly value: string;
}

export interface ExecutedHttpResponse {
  readonly statusCode: number;
  readonly statusText: string;
  readonly headers: readonly HttpHeader[];
  readonly body: string | object | null;
  readonly rawBody: string;
  readonly durationMs: number;
}

export interface ExecutedHttpRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: readonly HttpHeader[];
  readonly body: string | null;
}

export interface ExecutedHttpRequestUnit {
  readonly sourceType: SourceType;
  readonly sourceName: string;
  readonly requestIndex: number;
  readonly requestName: string | null;
  readonly request: ExecutedHttpRequest;
  readonly response: ExecutedHttpResponse;
}

export type ComparisonStrategy = "json" | "exact" | "partial";

export interface StrategySelectionContext {
  readonly expectedResponse: HttpRequest["expectedResponse"];
  readonly actualResponse: ExecutedHttpResponse;
}

export interface ResponseComparisonContext {
  /**
   * When null, comparator applies default assertion:
   * response status code must be 200.
   */
  readonly expectedResponse: HttpRequest["expectedResponse"];
  readonly actualResponse: ExecutedHttpResponse;
  readonly strategy?: ComparisonStrategy;
}

export interface ResponseComparisonMismatch {
  readonly field: string;
  readonly expected: unknown;
  readonly actual: unknown;
  readonly message: string;
}

export interface ResponseComparisonResult {
  readonly passed: boolean;
  readonly strategy: ComparisonStrategy;
  readonly mismatches: readonly ResponseComparisonMismatch[];
}

export interface ExecutionHttpExecutor {
  execute(unit: ResolvedHttpRequestUnit): Promise<ExecutedHttpRequestUnit>;
}

export interface ExecutionResponseComparator {
  compare(context: ResponseComparisonContext): ResponseComparisonResult;
}

export interface ExecutionOrchestratorOptions {
  readonly bail: number | null;
  readonly maxRequests: number | null;
  readonly defaultTimeBetweenRequests: number;
  readonly requestExecutionStrategy: RequestExecutionStrategy;
  readonly executor?: ExecutionHttpExecutor;
  readonly comparator?: ExecutionResponseComparator;
  readonly sleep?:
    | ((ms: number) => Promise<void>)
    | ((ms: number) => Promise<unknown>);
}

export interface ExecutionResult {
  readonly unit: ResolvedHttpRequestUnit;
  readonly passed: boolean;
  readonly executedUnit: ExecutedHttpRequestUnit | null;
  readonly comparison: ResponseComparisonResult | null;
  readonly error: Error | null;
}

export type ExecutionResultListener = (result: ExecutionResult) => void | Promise<void>;

export interface ExecuteOptions {
  readonly onResult?: ExecutionResultListener;
}

export interface ResultReporterOutput {
  info(message: string): void;
  error(message: string): void;
}

export interface ResultReporterOptions {
  readonly verbose?: boolean;
  readonly output?: ResultReporterOutput;
}

export interface ResultReportSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly errors: number;
  readonly durationMs: number;
}

export interface ResultReport {
  readonly summary: ResultReportSummary;
  readonly exitCode: 0 | 1;
}

export interface ResultSummaryOptions {
  readonly startedAtMs?: number;
}

export interface AppErrorOptions {
  readonly code?: string;
  readonly cause?: unknown;
  readonly details?: unknown;
}

export interface LazyRequestAppDependencies {
  readonly parseArgs?: (argv?: string[]) => ParsedArgs;
  readonly discoverHttpFiles?: (
    config: RuntimeConfig,
    extensions?: string[],
  ) => Promise<DiscoveryResult>;
  readonly createParser?: () => {
    parseInline(text: string, sourceName?: string): ParsedHttpSource;
    parseFiles(filePaths: string[]): Promise<ParsedHttpSource[]>;
  };
  readonly createResolver?: () => {
    resolveSources(sources: readonly ParsedHttpSource[]): ResolvedHttpRequestUnit[];
  };
  readonly createOrchestrator?: (options: Partial<ExecutionOrchestratorOptions>) => {
    execute(
      units: readonly ResolvedHttpRequestUnit[],
      options?: ExecuteOptions,
    ): Promise<ExecutionResult[]>;
  };
  readonly createReporter?: (options: ResultReporterOptions) => {
    report(results: readonly ExecutionResult[]): ResultReport;
    reportResult?(result: ExecutionResult): void;
    reportSummary?(results: readonly ExecutionResult[], options?: ResultSummaryOptions): ResultReport;
  };
}
