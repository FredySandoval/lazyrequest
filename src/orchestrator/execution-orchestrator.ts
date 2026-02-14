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

const DEFAULT_BAIL: number | null = null;
const DEFAULT_DELAY_MS = 0;
const DEFAULT_REQUEST_EXECUTION_STRATEGY: RequestExecutionStrategy = "concurrent";

export class ExecutionOrchestrator {
  private readonly bail: number | null;
  private readonly maxRequests: number | null;
  private readonly defaultTimeBetweenRequests: number;
  private readonly requestExecutionStrategy: RequestExecutionStrategy;
  private readonly executor: ExecutionHttpExecutor;
  private readonly comparator: ExecutionResponseComparator;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: Partial<ExecutionOrchestratorOptions> = {}) {
    this.bail = this.normalizeBail(options.bail ?? DEFAULT_BAIL);
    this.maxRequests = this.normalizeMaxRequests(options.maxRequests ?? null);
    this.defaultTimeBetweenRequests = Math.max(0, options.defaultTimeBetweenRequests ?? DEFAULT_DELAY_MS);
    this.requestExecutionStrategy = options.requestExecutionStrategy ?? DEFAULT_REQUEST_EXECUTION_STRATEGY;
    this.executor = options.executor ?? new HttpExecutor();
    this.comparator = options.comparator ?? new ResponseComparator();
    this.sleep = options.sleep
      ? async (ms: number) => {
          await options.sleep?.(ms);
        }
      : this.defaultSleep;
  }

  async execute(
    units: readonly ResolvedHttpRequestUnit[],
    options: ExecuteOptions = {},
  ): Promise<ExecutionResult[]> {
    const executionUnits = this.applyMaxRequests(units);
    const onResult = options.onResult;

    if (this.requestExecutionStrategy === "concurrent") {
      return this.executeConcurrent(executionUnits, onResult);
    }

    return this.executeRunInBand(executionUnits, onResult);
  }

  private async executeRunInBand(
    executionUnits: readonly ResolvedHttpRequestUnit[],
    onResult?: ExecuteOptions["onResult"],
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    let failedCount = 0;

    for (const [index, unit] of executionUnits.entries()) {
      if (index > 0 && this.defaultTimeBetweenRequests > 0) {
        await this.sleep(this.defaultTimeBetweenRequests);
      }

      const result = await this.executeSingleUnit(unit);
      results.push(result);
      await onResult?.(result);

      if (!result.passed) {
        failedCount += 1;
      }

      if (this.bail !== null && failedCount >= this.bail) {
        break;
      }
    }

    return results;
  }

  private async executeConcurrent(
    executionUnits: readonly ResolvedHttpRequestUnit[],
    onResult?: ExecuteOptions["onResult"],
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    await Promise.all(
      executionUnits.map(async (unit) => {
        const result = await this.executeSingleUnit(unit);
        results.push(result);
        await onResult?.(result);
      }),
    );
    return results;
  }

  private async executeSingleUnit(unit: ResolvedHttpRequestUnit): Promise<ExecutionResult> {
    try {
      const executedUnit = await this.executor.execute(unit);
      const comparison = this.comparator.compare({
        expectedResponse: unit.request.expectedResponse,
        actualResponse: executedUnit.response,
      });

      return {
        unit,
        passed: comparison.passed,
        executedUnit,
        comparison,
        error: null,
      };
    } catch (error) {
      return {
        unit,
        passed: false,
        executedUnit: null,
        comparison: null,
        error: this.toError(error),
      };
    }
  }

  private applyMaxRequests(units: readonly ResolvedHttpRequestUnit[]): readonly ResolvedHttpRequestUnit[] {
    if (this.maxRequests === null) {
      return units;
    }

    return units.slice(0, this.maxRequests);
  }

  private normalizeMaxRequests(value: number | null): number | null {
    if (value === null) {
      return null;
    }

    if (!Number.isInteger(value) || value <= 0) {
      return null;
    }

    return value;
  }

  private normalizeBail(value: number | null): number | null {
    if (value === null) {
      return null;
    }

    if (!Number.isInteger(value) || value <= 0) {
      return null;
    }

    return value;
  }

  private toError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    return new Error(String(error));
  }

  private defaultSleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}

export default ExecutionOrchestrator;
