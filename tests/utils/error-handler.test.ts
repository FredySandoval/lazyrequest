import { describe, expect, spyOn, test } from "bun:test";
import { errorHandler, AppError } from "../../src/utils/error-handler";
import { logger } from "../../src/utils/logger";

describe("ErrorHandler", () => {
  test("toMessage extracts message from supported error shapes", () => {
    expect(errorHandler.toMessage(new Error("boom"))).toBe("boom");
    expect(errorHandler.toMessage("boom text")).toBe("boom text");
    expect(errorHandler.toMessage({ message: "boom object" })).toBe(
      "boom object"
    );
    expect(errorHandler.toMessage(null, "fallback")).toBe("fallback");
  });

  test("normalize returns existing Error instance", () => {
    const input = new Error("existing");
    const output = errorHandler.normalize(input);
    expect(output).toBe(input);
  });

  test("normalize converts unknown values to Error", () => {
    const output = errorHandler.normalize({ foo: "bar" }, "fallback");
    expect(output).toBeInstanceOf(Error);
    expect(output.message).toBe("fallback");
  });

  test("wrap creates AppError and keeps metadata", () => {
    const cause = new Error("cause");
    const wrapped = errorHandler.wrap(cause, "wrapped", {
      code: "PARSER_ERROR",
      details: { source: "inline" },
    });

    expect(wrapped).toBeInstanceOf(AppError);
    expect(wrapped.message).toBe("wrapped");
    expect(wrapped.code).toBe("PARSER_ERROR");
    expect(wrapped.details).toEqual({ source: "inline" });
    expect(wrapped.cause).toBe(cause);
  });

  test("handle logs normalized error and returns it", () => {
    // @ts-ignore - accessing private field for testing
    const errorSpy = spyOn(logger["pinoLogger"], "error");

    const output = errorHandler.handle("string failure", "Parser failed");
    expect(output).toBeInstanceOf(Error);
    expect(output.message).toBe("string failure");
    expect(errorSpy).toHaveBeenCalledWith({ err: output }, "Parser failed");
  });
});
