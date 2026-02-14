import { logger } from "./logger";
import type { AppErrorOptions } from "../types/types";

export class AppError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : {});
    this.name = "AppError";
    this.code = options.code ?? "INTERNAL_ERROR";
    this.details = options.details;
  }
}

export class ErrorHandler {
  toMessage(error: unknown, fallbackMessage = "Unknown error"): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }

    if (typeof error === "string" && error.trim().length > 0) {
      return error;
    }

    if (this.isErrorLike(error)) {
      const message = error.message;
      if (typeof message === "string" && message.trim().length > 0) {
        return message;
      }
    }

    return fallbackMessage;
  }

  normalize(error: unknown, fallbackMessage = "Unknown error"): Error {
    if (error instanceof Error) {
      return error;
    }

    const message = this.toMessage(error, fallbackMessage);
    return new Error(message);
  }

  wrap(
    error: unknown,
    message: string,
    options: Omit<AppErrorOptions, "cause"> = {}
  ): AppError {
    return new AppError(message, {
      ...options,
      cause: error,
    });
  }

  handle(
    error: unknown,
    contextMessage = "Unexpected error occurred",
    fallbackMessage = "Unknown error"
  ): Error {
    const normalized = this.normalize(error, fallbackMessage);
    logger.error(contextMessage, normalized);
    return normalized;
  }

  private isErrorLike(value: unknown): value is { message?: unknown } {
    return typeof value === "object" && value !== null;
  }
}

export const errorHandler = new ErrorHandler();
