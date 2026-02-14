# LAZYREQUEST - Pseudo-code Architecture

## Data Flow

```
CLI Arguments (process.argv)
  ↓
parseArgs() (src/cli/args.ts, commander)
  ↓
ParsedArgs
  ↓
ConfigurationManager.buildConfig() (src/cli/config-manager.ts)
  ↓
RuntimeConfig
  ├── executionMode: "inline" | "single-file" | "folder"
  ├── searchPaths (absolute paths for file/folder modes)
  └── inlineHttpText (only for inline mode)
  ↓
Source Collection
  ├── inline mode:
  │     use RuntimeConfig.inlineHttpText directly
  └── single-file/folder modes:
        File Discovery (discoverHttpFiles, src/discovery/file-finder.ts)
          ├── single-file: one explicit file
          └── folder: recursive .http/.rest scan (with ignorePaths/maxDepth)
  ↓
Parser Adapter (src/parser/http-parser-adapter.ts)
  ↓
ParseResult[] from @fredy-dev/http-parser
  └── each ParseResult includes:
      ast.requests[]
      ast.globalVariables.fileVariables
      (plus parser metadata/segments/lineContexts)
  ↓
Source Normalization
  ↓
ParsedHttpSource[]
  ├── sourceType: "inline" | "file"
  ├── sourceName / filePath
  └── ast
  ↓
Variable Resolver
  ├── applies file-level + block-level variables
  └── resolves placeholders in URL, headers, body, expected response
  ↓
Resolved Request Units[]
  ↓
Execution Orchestrator
  ├── `concurrent` execution (default)
  ├── optional `runInBand` sequential execution
  ├── applies timeout/default headers/throttling/maxRequests
  ├── respects bail (stop after N failures)
  ├── can emit per-request completion events for live reporting
  └── delegates:
      1) HTTP Executor (src/executor/http-executor.ts) → ActualResponse
      2) Response Comparator (src/comparator/response-comparator.ts)
         + Strategy Selector (src/comparator/strategy-selector.ts)
         → assertion result + diff
  ↓
ExecutionResult[]
  ↓
Result Reporter
  ├── per-request Bun-style output (`✓`/`✗`, live or after-done)
  ├── diagnostics/diffs
  └── final summary + exit code

```

## Build order, TODO list, File Structure, Comments

```
1.  [x] src/types/types.ts                         # shared contracts used by all modules
2.  [x] src/utils/logger.ts                        # cross-cutting logging utility
3.  [x] src/utils/error-handler.ts                 # cross-cutting error normalization/handling
4.  [x] src/cli/args.ts                            # CLI argument parser (uses commanderjs)
5.  [x] src/cli/config-manager.ts                  # normalize + validate runtime config
6.  [x] src/discovery/file-finder.ts               # discover .http/.rest sources
7.  [x] src/parser/http-parser-adapter.ts          # adapter for @fredy-dev/http-parser
8.  [x] src/resolver/variable-resolver.ts          # resolve file/block variables into executable request units
9.  [x] src/executor/http-executor.ts              # send HTTP requests + enforce timeout + return normalized actual response
10. [x] src/comparator/strategy-selector.ts        # choose JSON vs exact vs partial comparison strategy
11. [x] src/comparator/response-comparator.ts      # compare expected vs actual response and build diff payload
12. [x] src/orchestrator/execution-orchestrator.ts # run resolved request units (concurrent or runInBand), throttle, maxRequests, bail
13. [x] src/reporter/result-reporter.ts            # print per-request result, diagnostics, and final summary/exit signals
14. [x] src/index.ts                               # composition root: wire all modules and run the selected mode
```

## Signatures

### src/utils/logger.ts
```ts
import pino from "pino";

class Logger {
  constructor();

  setVerbose(enabled: boolean): void;
  debug(message: string): void;
  info(message: string): void;
  error(message: string, error?: Error): void;
}

export const logger = new Logger();
export { Logger };
```

### src/utils/error-handler.ts
```ts
import { logger } from "./logger";
import type { AppErrorOptions } from "../types/types";

export class AppError extends Error {
  constructor(message: string, options: AppErrorOptions = {});
}

export class ErrorHandler {
  toMessage(error: unknown, fallbackMessage = "Unknown error"): string;
  normalize(error: unknown, fallbackMessage = "Unknown error"): Error;
  wrap(
    error: unknown,
    message: string,
    options: Omit<AppErrorOptions, "cause"> = {}
  ): AppError;
  handle(
    error: unknown,
    contextMessage = "Unexpected error occurred",
    fallbackMessage = "Unknown error"
  ): Error;
  private isErrorLike(value: unknown): value is { message?: unknown };
}
export const errorHandler = new ErrorHandler();
```

### src/cli/args.ts
```ts
import type { ParsedArgs } from "../types/types.ts";
import { Command, Option } from "commander";

function createCommand(): Command;
export function parseArgs(argv?: string[]): ParsedArgs;
```

### src/cli/config-manager.ts
```ts
import { resolve, isAbsolute } from "node:path"
import type {
  ExecutionMode,
  ParsedArgs,
  RequestExecutionStrategy,
  RuntimeConfig,
} from "../types/types.ts";

function isNonEmptyText(value: string | undefined): value is string;
function normalizePathInput(value: string | undefined): string | null;
function toAbsolutePath(value: string): string;
function normalizeHeaders(headers: Record<string, string>): Record<string, string>;
function assert(condition: boolean, message: string): asserts condition;
function validateArgs(args: ParsedArgs): void;
function validateConfig(config: RuntimeConfig): void;
function resolveExecutionMode(args: ParsedArgs): ExecutionMode;
function resolveSearchPaths(args: ParsedArgs, executionMode: ExecutionMode): string[];
function resolveInlineHttpText(args: ParsedArgs, executionMode: ExecutionMode): string | null;
function resolveRequestExecutionStrategy(args: ParsedArgs): RequestExecutionStrategy;

export class ConfigurationManager {
  constructor(args: ParsedArgs);

  buildConfig(args: ParsedArgs = this.args): RuntimeConfig;
  getSearchPaths(): string[];
  getInlineHttpText(): string | null;
  getExecutionMode(): ExecutionMode;
  getTimeout(): number;
  isVerbose(): boolean;
  shouldFailFast(): boolean;
  getDefaultHeaders(): Record<string, string>;
  private ensureConfig(): RuntimeConfig;
}
export default ConfigurationManager;
```

### src/discovery/file-finder.ts
```ts
import fg from "fast-glob";
import path from "node:path";
import type { RuntimeConfig } from "../types/types.ts";
import type { DiscoveryResult } from "../types/types.ts";

export async function discoverHttpFiles(
  config: RuntimeConfig,
  extensions: string[] = [".http", ".rest"]
): Promise<DiscoveryResult>;

async function findFilesInDirectories(
  searchPaths: readonly string[],
  extensions: string[],
  ignorePaths: readonly string[],
  maxDepth: number | null
): Promise<string[]>;

function buildIgnorePatterns(ignorePaths: readonly string[]): string[];
```

### src/parser/http-parser-adapter.ts
```ts
import { parseHttp, type ParserOptions } from "@fredy-dev/http-parser";
import type { ParsedHttpSource, HttpParserAdapterOptions } from "../types/types.ts";

export class HttpParserAdapter {
  constructor(options: HttpParserAdapterOptions = {});

  parseInline(text: string, sourceName = "inline"): ParsedHttpSource;
  async parseFile(filePath: string): Promise<ParsedHttpSource>;
  async parseFiles(filePaths: string[]): Promise<ParsedHttpSource[]>;
}
```

### src/resolver/variable-resolver.ts
```ts
import type {
  ParsedHttpSource,
  ResolvedHttpRequestUnit,
  VariableResolverOptions,
  HttpRequest,
} from "../types/types.ts";

export class VariableResolver {
  constructor(options: VariableResolverOptions = {});

  resolveSources(sources: readonly ParsedHttpSource[]): ResolvedHttpRequestUnit[];
  resolveSource(source: ParsedHttpSource): ResolvedHttpRequestUnit[];
  private resolveRequest(
    request: HttpRequest,
    variables: Readonly<Record<string, string>>,
  ): HttpRequest;
  private toVariableMap(
    variables: readonly { key: string; value: string }[],
  ): Record<string, string>;
  private interpolateString(
    input: string,
    variables: Readonly<Record<string, string>>,
  ): string;
  private interpolateUnknown<T>(
    value: T,
    variables: Readonly<Record<string, string>>,
  ): T;
}

export default VariableResolver;
```

### src/executor/http-executor.ts
```ts
import type {
  HttpRequest,
  HttpExecutorOptions,
  HttpHeader,
  ResolvedHttpRequestUnit,
  ExecutedHttpRequestUnit,
} from "../types/types.ts";

export class HttpExecutor {
  constructor(options: Partial<HttpExecutorOptions> = {});

  async execute(unit: ResolvedHttpRequestUnit): Promise<ExecutedHttpRequestUnit>;
  private normalizeMethod(method: HttpRequest["method"]): string;
  private buildHeaders(request: HttpRequest): Headers;
  private toRequestBody(body: HttpRequest["body"]): string | null;
  private async fetchWithTimeout(url: string, requestInit: RequestInit): Promise<Response>;
  private parseResponseBody(
    rawBody: string,
    contentType: string | null,
  ): string | object | null;
  private toHeaderEntries(headers: Headers): HttpHeader[];
  private toResponseHeaders(headers: Headers): HttpHeader[];
  private isAbortError(error: unknown): boolean;
}
export default HttpExecutor;
```

### src/comparator/strategy-selector.ts
```ts
import type {
  ComparisonStrategy,
  HttpHeader,
  StrategySelectionContext,
} from "../types/types.ts";

export class StrategySelector {
  select(context: StrategySelectionContext): ComparisonStrategy;

  private getHeaderValue(
    headers: readonly Pick<HttpHeader, "name" | "value">[],
    headerName: string,
  ): string | null;
  private isJsonContentType(contentType: string | null): boolean;
  private isHtmlContentType(contentType: string | null): boolean;
  private isJsonLikeBody(body: unknown): boolean;
  private hasWildcardPattern(body: unknown): boolean;
}
export default StrategySelector;
```

### src/comparator/response-comparator.ts
```ts
import { StrategySelector } from "./strategy-selector.ts";
import type {
  ComparisonStrategy,
  HttpHeader,
  ResponseComparisonContext,
  ResponseComparisonMismatch,
  ResponseComparisonResult,
} from "../types/types.ts";

export class ResponseComparator {
  constructor(strategySelector = new StrategySelector());

  compare(context: ResponseComparisonContext): ResponseComparisonResult;
  private compareStatus(
    expectedStatusCode: number,
    actualStatusCode: number,
    mismatches: ResponseComparisonMismatch[],
  ): void;
  private compareStatusText(
    expectedStatusText: string | null,
    actualStatusText: string,
    mismatches: ResponseComparisonMismatch[],
  ): void;
  private compareHeaders(
    expectedHeaders: readonly Pick<HttpHeader, "name" | "value">[],
    actualHeaders: readonly Pick<HttpHeader, "name" | "value">[],
    mismatches: ResponseComparisonMismatch[],
  ): void;
  private compareBody(
    strategy: ComparisonStrategy,
    expectedBody: unknown,
    actualBody: unknown,
    mismatches: ResponseComparisonMismatch[],
  ): void;
  private compareJsonBody(
    expectedBody: unknown,
    actualBody: unknown,
    mismatches: ResponseComparisonMismatch[],
  ): void;
  private compareExactBody(
    expectedBody: unknown,
    actualBody: unknown,
    mismatches: ResponseComparisonMismatch[],
  ): void;
  private comparePartialBody(
    expectedBody: unknown,
    actualBody: unknown,
    mismatches: ResponseComparisonMismatch[],
  ): void;
  private toComparableText(value: unknown): string;
  private toJsonComparable(value: unknown): unknown | undefined;
  private deepEqual(left: unknown, right: unknown): boolean;
  private stableStringify(value: unknown): string;
  private wildcardToRegExp(pattern: string): RegExp;
}
export default ResponseComparator;
```

### src/orchestrator/execution-orchestrator.ts
```ts
import { HttpExecutor } from "../executor/http-executor.ts";
import { ResponseComparator } from "../comparator/response-comparator.ts";
import type {
  ExecuteOptions,
  ExecutionOrchestratorOptions,
  ExecutionResult,
  ExecutionHttpExecutor,
  ExecutionResponseComparator,
  RequestExecutionStrategy,
  ResolvedHttpRequestUnit,
} from "../types/types.ts";

export class ExecutionOrchestrator {
  constructor(options: Partial<ExecutionOrchestratorOptions> = {});

  async execute(
    units: readonly ResolvedHttpRequestUnit[],
    options: ExecuteOptions = {},
  ): Promise<ExecutionResult[]>;
  private async executeRunInBand(
    executionUnits: readonly ResolvedHttpRequestUnit[],
    onResult?: ExecuteOptions["onResult"],
  ): Promise<ExecutionResult[]>;
  private async executeConcurrent(
    executionUnits: readonly ResolvedHttpRequestUnit[],
    onResult?: ExecuteOptions["onResult"],
  ): Promise<ExecutionResult[]>;
  private async executeSingleUnit(unit: ResolvedHttpRequestUnit): Promise<ExecutionResult>;
  private applyMaxRequests(units: readonly ResolvedHttpRequestUnit[]): readonly ResolvedHttpRequestUnit[];
  private normalizeMaxRequests(value: number | null): number | null;
  private toError(error: unknown): Error;
  private defaultSleep(ms: number): Promise<void>;
}
export default ExecutionOrchestrator;
```

### src/reporter/result-reporter.ts
```ts
import type {
  ExecutionResult,
  ResultReport,
  ResultReporterOptions,
  ResultReporterOutput,
  ResultSummaryOptions,
  ResponseComparisonMismatch,
} from "../types/types.ts";

export class ResultReporter {
  constructor(options: ResultReporterOptions = {});

  report(results: readonly ExecutionResult[]): ResultReport;
  reportResult(result: ExecutionResult): void;
  reportSummary(
    results: readonly ExecutionResult[],
    options: ResultSummaryOptions = {},
  ): ResultReport;
  private formatPassLine(result: ExecutionResult): string;
  private formatFailLine(result: ExecutionResult): string;
  private getRequestLabel(result: ExecutionResult): string;
  private formatMismatch(mismatch: ResponseComparisonMismatch): string;
  private stringifyValue(value: unknown): string;
}
export default ResultReporter;
```

### src/index.ts
```ts
import { parseArgs as parseCliArgs } from "./cli/args.ts";
import { ConfigurationManager } from "./cli/config-manager.ts";
import { discoverHttpFiles as discoverFiles } from "./discovery/file-finder.ts";
import { HttpParserAdapter } from "./parser/http-parser-adapter.ts";
import { VariableResolver } from "./resolver/variable-resolver.ts";
import { HttpExecutor } from "./executor/http-executor.ts";
import { ResponseComparator } from "./comparator/response-comparator.ts";
import { ExecutionOrchestrator } from "./orchestrator/execution-orchestrator.ts";
import { ResultReporter } from "./reporter/result-reporter.ts";
import { errorHandler } from "./utils/error-handler.ts";
import { logger } from "./utils/logger.ts";
import type {
  LazyRequestAppDependencies,
  ParsedHttpSource,
  ResultReport,
} from "./types/types.ts";

export async function run(
  argv?: string[],
  dependencies: LazyRequestAppDependencies = {},
): Promise<0 | 1>;

if (import.meta.main) {
  const exitCode = await run(Bun.argv.slice(2));
  process.exit(exitCode);
}
```
