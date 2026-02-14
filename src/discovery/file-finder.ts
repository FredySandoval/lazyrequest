import fg from "fast-glob";
import path from "node:path";
import type { RuntimeConfig } from "../types/types.ts";
import type { DiscoveryResult } from "../types/types.ts";

/**
 * Discovers HTTP files (.http, .rest) based on the runtime configuration.
 *
 * This function works in conjunction with ConfigurationManager and handles
 * all three execution modes:
 * - "inline": Returns empty array (no files to discover)
 * - "single-file": Returns the single file path from searchPaths
 * - "folder": Recursively discovers all matching files in directories
 *
 * @param config - Runtime configuration from ConfigurationManager
 * @param extensions - Array of file extensions to include (e.g., [".http", ".rest"])
 * @returns DiscoveryResult with files and metadata
 *
 * @example
 * const config = configManager.buildConfig();
 * const result = await discoverHttpFiles(config);
 * // Returns: { files: ["..."], mode: "folder", totalFound: 5 }
 */
export async function discoverHttpFiles(
  config: RuntimeConfig,
  extensions: string[] = [".http", ".rest"]
): Promise<DiscoveryResult> {
  const { executionMode, searchPaths, ignorePaths, maxDepth } = config;

  // Handle inline mode - no files to discover
  if (executionMode === "inline") {
    return {
      files: [],
      mode: "inline",
      totalFound: 0,
    };
  }

  // Handle single-file mode - searchPaths contains the file path directly
  if (executionMode === "single-file") {
    const filePath = searchPaths[0]!;
    return {
      files: [filePath],
      mode: "single-file",
      totalFound: 1,
    };
  }

  // Handle folder mode - recursively discover files in directories
  if (searchPaths.length === 0) {
    return {
      files: [],
      mode: "folder",
      totalFound: 0,
    };
  }

  const files = await findFilesInDirectories(
    searchPaths,
    extensions,
    ignorePaths,
    maxDepth
  );

  return {
    files,
    mode: "folder",
    totalFound: files.length,
  };
}

/**
 * Recursively finds files with specified extensions in given directories.
 *
 * @param searchPaths - Array of absolute directory paths to search
 * @param extensions - Array of file extensions to include
 * @param ignorePaths - Array of glob patterns to ignore (from config)
 * @returns Sorted array of absolute file paths
 */
async function findFilesInDirectories(
  searchPaths: readonly string[],
  extensions: string[],
  ignorePaths: readonly string[],
  maxDepth: number | null
): Promise<string[]> {
  // Build glob patterns for each search path + extension combination
  const patterns: string[] = [];
  for (const searchPath of searchPaths) {
    for (const ext of extensions) {
      // Normalize extension (ensure it starts with a dot)
      const normalizedExt = ext.startsWith(".") ? ext : `.${ext}`;
      patterns.push(path.join(searchPath, "**", `*${normalizedExt}`));
    }
  }

  // Convert ignore paths to glob patterns
  const ignorePatterns = buildIgnorePatterns(ignorePaths);

  // Use fast-glob to find files
  const files = await fg(patterns, {
    absolute: true,
    onlyFiles: true,
    ignore: ignorePatterns,
    deep: maxDepth === null ? undefined : maxDepth,
  });

  // Return sorted list for deterministic ordering
  return files.sort();
}

/**
 * Builds glob ignore patterns from config ignorePaths.
 * Ensures patterns work correctly with fast-glob.
 *
 * @param ignorePaths - Array of ignore patterns from config
 * @returns Array of glob patterns for fast-glob
 */
function buildIgnorePatterns(ignorePaths: readonly string[]): string[] {
  const patterns: string[] = [
    "**/.*", // Hidden files (always exclude)
    "**/.*/**", // Hidden directories (always exclude)
  ];

  for (const ignorePath of ignorePaths) {
    // If it's already a glob pattern, use it as-is
    if (ignorePath.includes("*") || ignorePath.includes("?")) {
      patterns.push(ignorePath);
    } else {
      // Treat as directory or file name - add glob patterns for both
      patterns.push(`**/${ignorePath}`);
      patterns.push(`**/${ignorePath}/**`);
    }
  }

  return patterns;
}
