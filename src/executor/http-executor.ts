import type {
  HttpRequest,
  HttpExecutorOptions,
  HttpHeader,
  ResolvedHttpRequestUnit,
  ExecutedHttpRequestUnit,
} from "../types/types.ts";

const DEFAULT_TIMEOUT_MS = 5_000;

export class HttpExecutor {
  private readonly timeout: number;
  private readonly defaultHeaders: Readonly<Record<string, string>>;

  constructor(options: Partial<HttpExecutorOptions> = {}) {
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    this.defaultHeaders = options.defaultHeaders ?? {};
  }

  async execute(unit: ResolvedHttpRequestUnit): Promise<ExecutedHttpRequestUnit> {
    const method = this.normalizeMethod(unit.request.method);
    const url = unit.request.url;

    if (typeof url !== "string" || url.trim().length === 0) {
      throw new Error(`Request URL is required (source: ${unit.sourceName}, requestIndex: ${unit.requestIndex}).`);
    }

    const headers = this.buildHeaders(unit.request);
    const body = this.toRequestBody(unit.request.body);

    const requestInit: RequestInit = {
      method,
      headers,
      body,
    };

    const startedAt = performance.now();
    const response = await this.fetchWithTimeout(url, requestInit);
    const endedAt = performance.now();
    const rawBody = await response.text();

    return {
      sourceType: unit.sourceType,
      sourceName: unit.sourceName,
      requestIndex: unit.requestIndex,
      requestName: unit.request.name,
      request: {
        method,
        url,
        headers: this.toHeaderEntries(headers),
        body,
      },
      response: {
        statusCode: response.status,
        statusText: response.statusText,
        headers: this.toResponseHeaders(response.headers),
        body: this.parseResponseBody(rawBody, response.headers.get("content-type")),
        rawBody,
        durationMs: Math.max(0, Math.round(endedAt - startedAt)),
      },
    };
  }

  private normalizeMethod(method: HttpRequest["method"]): string {
    if (typeof method === "string" && method.trim().length > 0) {
      return method.toUpperCase();
    }

    return "GET";
  }

  private buildHeaders(request: HttpRequest): Headers {
    const headers = new Headers();

    for (const [name, value] of Object.entries(this.defaultHeaders)) {
      headers.set(name, value);
    }

    for (const header of request.headers) {
      headers.set(header.name, header.value);
    }

    if (request.body?.contentType && !headers.has("content-type")) {
      headers.set("content-type", request.body.contentType);
    }

    return headers;
  }

  private toRequestBody(body: HttpRequest["body"]): string | null {
    if (body === null) {
      return null;
    }

    if (typeof body.raw !== "string" || body.raw.length === 0) {
      return null;
    }

    return body.raw;
  }

  private async fetchWithTimeout(url: string, requestInit: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      return await fetch(url, {
        ...requestInit,
        signal: controller.signal,
      });
    } catch (error) {
      if (this.isAbortError(error)) {
        throw new Error(`Request timed out after ${this.timeout}ms: ${url}`);
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseResponseBody(
    rawBody: string,
    contentType: string | null,
  ): string | object | null {
    if (rawBody.length === 0) {
      return null;
    }

    if (typeof contentType === "string" && contentType.toLowerCase().includes("application/json")) {
      try {
        return JSON.parse(rawBody) as object;
      } catch {
        return rawBody;
      }
    }

    return rawBody;
  }

  private toHeaderEntries(headers: Headers): HttpHeader[] {
    return Array.from(headers.entries()).map(([name, value]) => ({
      name,
      value,
    }));
  }

  private toResponseHeaders(headers: Headers): HttpHeader[] {
    return this.toHeaderEntries(headers);
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
  }
}

export default HttpExecutor;
