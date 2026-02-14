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

const HTTP_FILE_EXTENSIONS = [".http", ".rest"] as const;

export async function run(
  argv?: string[],
  dependencies: LazyRequestAppDependencies = {},
): Promise<0 | 1> {
  try {
    const parseArgs = dependencies.parseArgs ?? parseCliArgs;
    const discoverHttpFiles = dependencies.discoverHttpFiles ?? discoverFiles;
    const parser = dependencies.createParser?.() ?? new HttpParserAdapter();
    const resolver = dependencies.createResolver?.() ?? new VariableResolver();

    const args = parseArgs(argv);
    const config = new ConfigurationManager(args).buildConfig();

    logger.setVerbose(config.verbose);
    logger.debug(`Execution mode: ${config.executionMode}`);

    const parsedSources: ParsedHttpSource[] =
      config.executionMode === "inline"
        ? [parser.parseInline(config.inlineHttpText, "inline")]
        : await parser.parseFiles(
            (await discoverHttpFiles(config, [...HTTP_FILE_EXTENSIONS])).files,
          );

    const units = resolver.resolveSources(parsedSources);

    const orchestrator =
      dependencies.createOrchestrator?.({
        bail: config.bail,
        maxRequests: config.maxRequests,
        defaultTimeBetweenRequests: config.defaultTimeBetweenRequests,
        requestExecutionStrategy: config.requestExecutionStrategy,
        executor: new HttpExecutor({
          timeout: config.timeout,
          defaultHeaders: config.defaultHeaders,
        }),
        comparator: new ResponseComparator(),
      }) ??
      new ExecutionOrchestrator({
        bail: config.bail,
        maxRequests: config.maxRequests,
        defaultTimeBetweenRequests: config.defaultTimeBetweenRequests,
        requestExecutionStrategy: config.requestExecutionStrategy,
        executor: new HttpExecutor({
          timeout: config.timeout,
          defaultHeaders: config.defaultHeaders,
        }),
        comparator: new ResponseComparator(),
      });

    const reporter =
      dependencies.createReporter?.({ verbose: config.verbose }) ??
      new ResultReporter({ verbose: config.verbose });

    const startedAtMs = Date.now();
    const results = await orchestrator.execute(units, {
      onResult:
        config.showAfterDone || !("reportResult" in reporter) || typeof reporter.reportResult !== "function"
          ? undefined
          : (result) => reporter.reportResult?.(result),
    });

    let report: ResultReport;
    if (config.showAfterDone || !("reportSummary" in reporter) || typeof reporter.reportSummary !== "function") {
      report = reporter.report(results);
    } else {
      report = reporter.reportSummary(results, { startedAtMs });
    }

    return report.exitCode;
  } catch (error) {
    const normalized = errorHandler.handle(error, "LAZYREQUEST execution failed");
    console.error(normalized.message);
    return 1;
  }
}

if (import.meta.main) {
  const exitCode = await run(Bun.argv.slice(2));
  process.exit(exitCode);
}
