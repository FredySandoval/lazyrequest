import type {
  ParsedHttpSource,
  ResolvedHttpRequestUnit,
  VariableResolverOptions,
  HttpRequest,
} from "../types/types.ts";

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
const HAS_PLACEHOLDER_PATTERN = /\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}/;
const DEFAULT_MAX_INTERPOLATION_PASSES = 10;

export class VariableResolver {
  private readonly maxInterpolationPasses: number;
  private readonly throwOnUnresolved: boolean;

  constructor(options: VariableResolverOptions = {}) {
    this.maxInterpolationPasses =
      options.maxInterpolationPasses ?? DEFAULT_MAX_INTERPOLATION_PASSES;
    this.throwOnUnresolved = options.throwOnUnresolved ?? false;
  }

  resolveSources(sources: readonly ParsedHttpSource[]): ResolvedHttpRequestUnit[] {
    if (!Array.isArray(sources)) {
      throw new Error("sources must be an array of ParsedHttpSource");
    }

    const resolved: ResolvedHttpRequestUnit[] = [];
    for (const source of sources) {
      resolved.push(...this.resolveSource(source));
    }

    return resolved;
  }

  resolveSource(source: ParsedHttpSource): ResolvedHttpRequestUnit[] {
    const fileVariables = this.toVariableMap(
      source.ast.fileScopedVariables?.fileVariables ?? source.ast.globalVariables.fileVariables,
    );

    return source.ast.requests.map((request, requestIndex) => {
      const blockVariables = this.toVariableMap(request.blockVariables.fileVariables);
      const mergedVariables = {
        ...fileVariables,
        ...blockVariables,
      };

      const resolvedRequest = this.resolveRequest(request, mergedVariables);

      if (source.sourceType === "file") {
        return {
          sourceType: "file",
          sourceName: source.sourceName,
          filePath: source.filePath,
          requestIndex,
          request: resolvedRequest,
        };
      }

      return {
        sourceType: "inline",
        sourceName: source.sourceName,
        requestIndex,
        request: resolvedRequest,
      };
    });
  }

  private resolveRequest(
    request: HttpRequest,
    variables: Readonly<Record<string, string>>,
  ): HttpRequest {
    const cloned = structuredClone(request);

    cloned.url = this.interpolateString(cloned.url, variables);
    cloned.headers = cloned.headers.map((header) => ({
      ...header,
      name: this.interpolateString(header.name, variables),
      value: this.interpolateString(header.value, variables),
    }));

    if (cloned.body !== null) {
      cloned.body = this.interpolateUnknown(cloned.body, variables) as HttpRequest["body"];
    }

    if (cloned.expectedResponse !== null) {
      const expectedResponse = cloned.expectedResponse;
      const expectedVariables = {
        ...variables,
        ...this.toVariableMap(expectedResponse.variables.fileVariables),
      };

      expectedResponse.statusText =
        expectedResponse.statusText === null
          ? null
          : this.interpolateString(expectedResponse.statusText, expectedVariables);

      expectedResponse.headers = expectedResponse.headers.map((header) => ({
        ...header,
        name: this.interpolateString(header.name, expectedVariables),
        value: this.interpolateString(header.value, expectedVariables),
      }));

      expectedResponse.body = this.interpolateUnknown(
        expectedResponse.body,
        expectedVariables,
      ) as NonNullable<HttpRequest["expectedResponse"]>["body"];
    }

    return cloned;
  }

  private toVariableMap(
    variables: readonly { key: string; value: string }[],
  ): Record<string, string> {
    const map: Record<string, string> = {};

    for (const variable of variables) {
      if (variable.key.trim().length === 0) {
        continue;
      }
      map[variable.key] = variable.value;
    }

    return map;
  }

  private interpolateString(
    input: string,
    variables: Readonly<Record<string, string>>,
  ): string {
    let output = input;

    for (let pass = 0; pass < this.maxInterpolationPasses; pass += 1) {
      let changed = false;
      output = output.replace(PLACEHOLDER_PATTERN, (_match, variableName: string) => {
        const replacement = variables[variableName];
        if (replacement === undefined) {
          if (this.throwOnUnresolved) {
            throw new Error(`Unresolved variable: {{${variableName}}}`);
          }
          return `{{${variableName}}}`;
        }

        changed = true;
        return replacement;
      });

      if (!changed || !HAS_PLACEHOLDER_PATTERN.test(output)) {
        break;
      }
    }

    return output;
  }

  private interpolateUnknown<T>(
    value: T,
    variables: Readonly<Record<string, string>>,
  ): T {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === "string") {
      return this.interpolateString(value, variables) as T;
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.interpolateUnknown(entry, variables)) as T;
    }

    if (typeof value === "object") {
      const source = value as Record<string, unknown>;
      const target: Record<string, unknown> = {};
      for (const [key, current] of Object.entries(source)) {
        target[key] = this.interpolateUnknown(current, variables);
      }
      return target as T;
    }

    return value;
  }
}

export default VariableResolver;
