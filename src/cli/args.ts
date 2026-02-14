import type { ParsedArgs } from "../types/types.ts";
import { Command, Option } from "commander";

/**
 * CLI argument parser for LAZYREQUEST
 * 
 * input: ["--http", "GET https://...", "--timeout", "5000"]
 * output: ParsedArgs
 */

function createCommand(): Command {
  const program = new Command();

  program
    .name("lazyrequest")
    .description("A lightweight minimal API Testing Client tool")
    .addOption(new Option("--http <request>", "Execute inline HTTP request template").conflicts(["httpFile", "httpFolder"])) 
    .addOption(new Option("--httpFile <path>", "Specify a .http/.rest template file").conflicts(["http", "httpFolder"]))
    .addOption(new Option("--httpFolder <path>", "Specify a directory to read from").conflicts(["http", "httpFile"]))
    .addOption(
       new Option("-t, --timeout <ms>", "Request timeout in milliseconds")
         .default(5000)
         .argParser((v) => {
           const n = Number(v);
           if (!Number.isInteger(n) || n <= 0) {
             throw new Error("Timeout must be a positive integer");
           }
           return n;
         })
     )
    .addOption(new Option("-v, --verbose", "Enable verbose logging").default(false))
    .addOption(new Option("--bail [count]", "Stop after N failures (default N=1 when provided without a value)"))
    .addOption(new Option("--runInBand", "Execute requests sequentially"))
    .addOption(new Option("--concurrent", "Execute requests concurrently"))
    .addOption(new Option("--showAfterDone", "Print results only after all requests finish"))
    .showHelpAfterError();

  return program;
}

export function parseArgs(argv?: string[]): ParsedArgs {
  const program = createCommand();
  program.parse(argv, { from: 'user' });

  const opts = program.opts();

  const bail = normalizeBailOption(opts.bail);

  return {
    http: opts.http,
    httpFile: opts.httpFile,
    httpFolder: opts.httpFolder,
    timeout: Number(opts.timeout),
    verbose: !!opts.verbose,
    bail,
    runInBand: !!opts.runInBand,
    concurrent: !!opts.concurrent,
    showAfterDone: !!opts.showAfterDone,
  };
}

function normalizeBailOption(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === false) {
    return null;
  }

  if (raw === true || raw === "") {
    return 1;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Bail count must be a positive integer.");
  }

  return parsed;
}
