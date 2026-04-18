import fs from "node:fs";
import path from "node:path";

const SAFE_IDENTIFIER_RE = /^[a-zA-Z0-9_-]+$/;
const ENCODED_SEGMENT_RE = /%(?:2e|2f|5c|3f|23)/i;
const PROMPT_INJECTION_RE =
  /\b(ignore (?:all |any |the )?(?:previous|prior|earlier) instructions|system prompt|developer message|tool call|function call|do not trust previous instructions|override your instructions)\b/gi;

/** Structured error with machine-readable code and exit code for CLI output. */
export class CLIError extends Error {
  code: string;
  exitCode: number;
  details?: unknown;

  constructor(
    message: string,
    options?: { code?: string; exitCode?: number; details?: unknown },
  ) {
    super(message);
    this.name = "CLIError";
    this.code = options?.code ?? "CLI_ERROR";
    this.exitCode = options?.exitCode ?? 1;
    this.details = options?.details;
  }
}

/** Throw if the value contains path traversal, control chars, or unsafe characters. */
export function assertSafeIdentifier(
  value: string,
  label = "identifier",
): void {
  if (value.length === 0) {
    throw new CLIError(`${label} contains invalid characters or is empty.`, {
      code: "INVALID_IDENTIFIER",
      exitCode: 2,
    });
  }

  if (containsControlCharacters(value)) {
    throw new CLIError(`${label} contains control characters.`, {
      code: "INVALID_IDENTIFIER",
      exitCode: 2,
      details: { label, value },
    });
  }

  if (
    value.includes("../") ||
    value.includes("..\\") ||
    value.includes("/") ||
    value.includes("\\")
  ) {
    throw new CLIError(
      `${label} contains invalid characters or traversal sequences.`,
      {
        code: "INVALID_IDENTIFIER",
        exitCode: 2,
        details: { label, value },
      },
    );
  }

  if (ENCODED_SEGMENT_RE.test(value)) {
    throw new CLIError(
      `${label} must not contain percent-encoded path or query segments.`,
      {
        code: "INVALID_IDENTIFIER",
        exitCode: 2,
        details: { label, value },
      },
    );
  }

  if (value.includes("?") || value.includes("#")) {
    throw new CLIError(
      `${label} must not contain embedded query or fragment characters.`,
      {
        code: "INVALID_IDENTIFIER",
        exitCode: 2,
        details: { label, value },
      },
    );
  }

  if (!SAFE_IDENTIFIER_RE.test(value)) {
    throw new CLIError(
      `${label} contains invalid characters. Use letters, numbers, hyphens, or underscores only.`,
      {
        code: "INVALID_IDENTIFIER",
        exitCode: 2,
        details: { label, value },
      },
    );
  }
}

/** Strip control characters and redact prompt-injection patterns from a string. */
export function sanitizeAgentText(value: string): string {
  const withoutControlChars = stripControlCharacters(value).trim();
  if (withoutControlChars.length === 0) {
    return withoutControlChars;
  }

  return withoutControlChars.replace(
    PROMPT_INJECTION_RE,
    "[redacted-potential-prompt-injection]",
  );
}

/** Recursively sanitize all strings in a value for safe agent consumption. */
export function sanitizeForAgent<T>(value: T): T {
  if (typeof value === "string") {
    return sanitizeAgentText(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForAgent(item)) as T;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value).map(([key, nestedValue]) => [
      key,
      sanitizeForAgent(nestedValue),
    ]);
    return Object.fromEntries(entries) as T;
  }

  return value;
}

/** Resolve an output path, throwing if it escapes the working directory. */
export function resolveOutputPath(cwd: string, requestedPath: string): string {
  if (containsControlCharacters(requestedPath)) {
    throw new CLIError("Output path contains control characters.", {
      code: "INVALID_OUTPUT_PATH",
      exitCode: 2,
    });
  }

  const resolved = path.resolve(cwd, requestedPath);
  const relative = path.relative(cwd, resolved);
  if (
    relative.startsWith("..") ||
    path.isAbsolute(relative) ||
    requestedPath.startsWith("~")
  ) {
    throw new CLIError(
      "Output path must stay inside the current working directory. The agent is not a trusted operator.",
      {
        code: "INVALID_OUTPUT_PATH",
        exitCode: 2,
        details: { cwd, requestedPath },
      },
    );
  }

  return resolved;
}

/** Write content to a sandboxed path within the working directory. */
export function writeSandboxedOutput(
  cwd: string,
  requestedPath: string,
  content: string,
): string {
  const resolvedPath = resolveOutputPath(cwd, requestedPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, content, "utf8");
  return resolvedPath;
}

function containsControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
}

function stripControlCharacters(value: string): string {
  let output = "";
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code > 31 && code !== 127) {
      output += character;
    }
  }
  return output;
}
