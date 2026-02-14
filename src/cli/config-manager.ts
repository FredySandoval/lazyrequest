import { resolve, isAbsolute } from "node:path"
import type {
  ExecutionMode,
  ParsedArgs,
  RequestExecutionStrategy,
  RuntimeConfig,
} from "../types/types.ts";

const DEFAULT_IGNORE_PATHS = ["node_modules", ".git"];
const DEFAULT_TIME_BETWEEN_REQUESTS = 300;
const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent": "lazyrequest/1.0",
  "Accept": "*/*",
};
const DEFAULT_MAX_REQUESTS: number | null = null;
const DEFAULT_MAX_DEPTH: number | null = 10;

const WHITESPACE_ONLY = /^\s*$/;

function isNonEmptyText(value: string | undefined): value is string {
  return typeof value === "string" && !WHITESPACE_ONLY.test(value);
}

function normalizePathInput(value: string | undefined): string | null {
  if (!isNonEmptyText(value)) {
    return null;
  }
  return value.trim();
}

function toAbsolutePath(value: string): string {
  return resolve(value);
}

function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [name, rawValue] of Object.entries(headers)) {
    const key = name.trim().toLowerCase();
    if (!key) {
      continue;
    }
    normalized[key] = rawValue;
  }
  return normalized;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function validateArgs(args: ParsedArgs): void {
  const provided = [args.http, args.httpFile, args.httpFolder].filter(isNonEmptyText).length;
  assert(provided <= 1, "Only one of --http, --httpFile, or --httpFolder may be provided.");
  assert(!(args.runInBand && args.concurrent), "Only one of --runInBand or --concurrent may be provided.");
}

function validateConfig(config: RuntimeConfig): void {
  assert(Number.isInteger(config.timeout) && config.timeout > 0, "Timeout must be a positive integer.");
  assert(config.defaultTimeBetweenRequests >= 0, "Default time between requests must be >= 0.");

  if (config.maxRequests !== null) {
    assert(Number.isInteger(config.maxRequests) && config.maxRequests > 0, "Max requests must be a positive integer.");
  }

  if (config.maxDepth !== null) {
    assert(Number.isInteger(config.maxDepth) && config.maxDepth >= 0, "Max depth must be >= 0.");
  }

  if (config.executionMode === "inline") {
    assert(isNonEmptyText(config.inlineHttpText), "Inline HTTP text is required when using --http.");
    assert(config.searchPaths.length === 0, "Search paths must be empty in inline mode.");
  }

  if (config.executionMode === "single-file") {
    assert(config.searchPaths.length === 1, "Exactly one file path is required when using --httpFile.");
    assert(config.inlineHttpText === null, "Inline HTTP text is not allowed in single-file mode.");
  }

  if (config.executionMode === "folder") {
    assert(config.searchPaths.length >= 1, "At least one folder path is required in folder mode.");
    assert(config.inlineHttpText === null, "Inline HTTP text is not allowed in folder mode.");
  }

  for (const searchPath of config.searchPaths) {
    assert(isAbsolute(searchPath), "All search paths must be absolute.");
  }
}

function resolveExecutionMode(args: ParsedArgs): ExecutionMode {
  if (isNonEmptyText(args.http)) {
    return "inline";
  }

  if (isNonEmptyText(args.httpFile)) {
    return "single-file";
  }

  if (isNonEmptyText(args.httpFolder)) {
    return "folder";
  }

  return "folder";
}

function resolveSearchPaths(args: ParsedArgs, executionMode: ExecutionMode): string[] {
  if (executionMode === "inline") {
    return [];
  }

  if (executionMode === "single-file") {
    const filePath = normalizePathInput(args.httpFile);
    assert(filePath !== null, "--httpFile requires a non-empty path.");
    return [toAbsolutePath(filePath)];
  }

  const folderPath = normalizePathInput(args.httpFolder) ?? process.cwd();
  return [toAbsolutePath(folderPath)];
}

function resolveInlineHttpText(args: ParsedArgs, executionMode: ExecutionMode): string | null {
  if (executionMode !== "inline") {
    return null;
  }

  assert(isNonEmptyText(args.http), "--http requires a non-empty request template.");
  return args.http;
}

function resolveRequestExecutionStrategy(args: ParsedArgs): RequestExecutionStrategy {
  if (args.runInBand) {
    return "runInBand";
  }

  return "concurrent";
}

export class ConfigurationManager {
  private args: ParsedArgs;
  private config: RuntimeConfig | null = null;

  constructor(args: ParsedArgs) {
    this.args = args;
  }

  buildConfig(args: ParsedArgs = this.args): RuntimeConfig {
    this.args = args;
    validateArgs(args);
    const executionMode = resolveExecutionMode(args);
    const searchPaths = resolveSearchPaths(args, executionMode);
    const inlineHttpText = resolveInlineHttpText(args, executionMode);

    const shared = {
      ignorePaths: [...DEFAULT_IGNORE_PATHS],
      timeout: args.timeout,
      defaultTimeBetweenRequests: DEFAULT_TIME_BETWEEN_REQUESTS,
      verbose: args.verbose,
      bail: args.bail,
      requestExecutionStrategy: resolveRequestExecutionStrategy(args),
      showAfterDone: args.showAfterDone,
      defaultHeaders: normalizeHeaders(DEFAULT_HEADERS),
      maxRequests: DEFAULT_MAX_REQUESTS,
      maxDepth: DEFAULT_MAX_DEPTH,
    };

    let config: RuntimeConfig;
    if (executionMode === "inline") {
      assert(inlineHttpText !== null, "Inline HTTP text must be present in inline mode.");
      config = {
        ...shared,
        executionMode: "inline",
        searchPaths: [],
        inlineHttpText,
      };
    } else if (executionMode === "single-file") {
      assert(searchPaths.length === 1, "Exactly one file path is required when using --httpFile.");
      const [filePath] = searchPaths;
      assert(!!filePath, "File path is required for single-file mode.");
      config = {
        ...shared,
        executionMode: "single-file",
        searchPaths: [filePath],
        inlineHttpText: null,
      };
    } else {
      assert(searchPaths.length >= 1, "At least one folder path is required in folder mode.");
      const [first, ...rest] = searchPaths;
      assert(!!first, "At least one folder path is required in folder mode.");
      config = {
        ...shared,
        executionMode: "folder",
        searchPaths: [first, ...rest],
        inlineHttpText: null,
      };
    }

    validateConfig(config);
    this.config = config;
    return config;
  }

  getSearchPaths(): string[] {
    return [...this.ensureConfig().searchPaths];
  }

  getInlineHttpText(): string | null {
    return this.ensureConfig().inlineHttpText;
  }

  getExecutionMode(): ExecutionMode {
    return this.ensureConfig().executionMode;
  }

  getTimeout(): number {
    return this.ensureConfig().timeout;
  }

  isVerbose(): boolean {
    return this.ensureConfig().verbose;
  }

  getBail(): number | null {
    return this.ensureConfig().bail;
  }

  getDefaultHeaders(): Record<string, string> {
    return { ...this.ensureConfig().defaultHeaders };
  }

  private ensureConfig(): RuntimeConfig {
    if (!this.config) {
      this.config = this.buildConfig(this.args);
    }
    return this.config;
  }
}

export default ConfigurationManager;
