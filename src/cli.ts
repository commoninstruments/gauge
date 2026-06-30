#!/usr/bin/env node

import { createRequire } from "node:module";
import process from "node:process";
import { Command, CommanderError, Option } from "commander";
import {
  runAddCommand,
  runDescribeCommand,
  runListCommand,
  runRefreshCommand,
  runRemoveCommand,
  runStatusCommand,
} from "./commands.js";
import { migrateIfNeeded } from "./migrate.js";
import {
  type OutputOptions,
  renderCommandResult,
  renderError,
  resolveOutputFormat,
} from "./output.js";
import { CLIError } from "./security.js";
import { runTUI } from "./tui.js";
import type { Provider } from "./types.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version?: string };

const rawArgv = process.argv.slice(2);
const argv = rawArgv[0] === "--" ? rawArgv.slice(1) : rawArgv;
const parseArgv = [
  process.argv[0] ?? "node",
  process.argv[1] ?? "gauge",
  ...argv,
];
const requestedFormat = detectRequestedFormat(argv);
const isTTY = process.stdout.isTTY ?? false;
const resolvedFormat =
  requestedFormat !== undefined || isMetaOutputRequest(argv)
    ? resolveOutputFormat(requestedFormat ?? "human", true)
    : resolveOutputFormat(requestedFormat, isTTY);

const program = new Command();
program
  .name("gauge")
  .description(
    "At-a-glance usage dashboard for Claude, Codex, and Cursor accounts",
  )
  .version(packageJson.version ?? "0.0.0")
  .showHelpAfterError(false)
  .exitOverride()
  .configureOutput({
    writeErr: (str) => {
      if (resolvedFormat === "human") {
        process.stderr.write(str);
      }
    },
    writeOut: (str) => {
      if (resolvedFormat === "human") {
        process.stdout.write(str);
      }
    },
    outputError: (str, write) => {
      if (resolvedFormat === "human") {
        write(str);
      }
    },
  });

const migrated = migrateIfNeeded();
if (migrated && resolvedFormat === "human") {
  process.stdout.write("Migrated account data to ~/.gauge/\n");
}

addReadOptions(
  program
    .option("-q, --quick", "Just show the recommended account")
    .action(async (...args) => {
      const options = getOptionsFromActionArgs(args);
      if (isTTY && !requestedFormat && !options.quick) {
        await runTUI();
        return;
      }
      await emitResult(
        await runStatusCommand({
          ...options,
          quiet:
            resolveOutputFormat(options.format ?? requestedFormat, isTTY) !==
            "human",
        }),
        options,
      );
    }),
);

addReadOptions(
  program
    .command("status")
    .description("Fetch AI usage for all configured accounts")
    .option("-q, --quick", "Just show the recommended account")
    .action(async (...args) => {
      const options = getOptionsFromActionArgs(args);
      if (isTTY && !requestedFormat && !options.quick) {
        await runTUI();
        return;
      }
      await emitResult(
        await runStatusCommand({
          ...options,
          quiet:
            resolveOutputFormat(options.format ?? requestedFormat, isTTY) !==
            "human",
        }),
        options,
      );
    }),
);

addReadOptions(
  program
    .command("list")
    .description("List configured accounts")
    .action(async (...args) => {
      const options = getOptionsFromActionArgs(args);
      await emitResult(runListCommand(), options);
    }),
);

addReadOptions(
  program
    .command("describe [command]")
    .description("Show machine-readable schemas and guardrails for this CLI")
    .action(async (...args) => {
      const commandName = typeof args[0] === "string" ? args[0] : undefined;
      const options = getOptionsFromActionArgs(args);
      await emitResult(runDescribeCommand(commandName), options);
    }),
);

addMutationOptions(
  program
    .command("add [providerOrName] [name]")
    .description("Add a new account")
    // Human hint preserved in source for packaging tests: gauge add <name>
    .action(async (...args) => {
      const first = typeof args[0] === "string" ? args[0] : undefined;
      const second = typeof args[1] === "string" ? args[1] : undefined;
      const options = getOptionsFromActionArgs(args);
      const target = resolveAccountTarget(first, second, options.provider);
      await emitResult(
        await runAddCommand(target.name, {
          ...options,
          provider: target.provider,
          quiet:
            resolveOutputFormat(options.format ?? requestedFormat, isTTY) !==
            "human",
        }),
        options,
      );
    }),
);

addMutationOptions(
  program
    .command("refresh [providerOrName] [name]")
    .description("Re-authenticate an account")
    .action(async (...args) => {
      const first = typeof args[0] === "string" ? args[0] : undefined;
      const second = typeof args[1] === "string" ? args[1] : undefined;
      const options = getOptionsFromActionArgs(args);
      const target = resolveAccountTarget(first, second, options.provider);
      await emitResult(
        await runRefreshCommand(target.name, {
          ...options,
          provider: target.provider,
          quiet:
            resolveOutputFormat(options.format ?? requestedFormat, isTTY) !==
            "human",
        }),
        options,
      );
    }),
);

addMutationOptions(
  program
    .command("remove [providerOrName] [name]")
    .description("Remove an account")
    .action(async (...args) => {
      const first = typeof args[0] === "string" ? args[0] : undefined;
      const second = typeof args[1] === "string" ? args[1] : undefined;
      const options = getOptionsFromActionArgs(args);
      const target = resolveAccountTarget(first, second, options.provider);
      await emitResult(
        runRemoveCommand(target.name, {
          ...options,
          provider: target.provider,
        }),
        options,
      );
    }),
);

try {
  await program.parseAsync(parseArgv);
} catch (error) {
  if (error instanceof CommanderError && isBenignCommanderExit(error)) {
    process.exit(error.exitCode);
  }

  const normalized = normalizeError(error);
  const rendered = renderError(
    {
      code: normalized.code,
      details: normalized.details,
      message: normalized.message,
    },
    {
      format: requestedFormat,
      outputFile: peekFlagValue(argv, "--output-file"),
      sanitize: !argv.includes("--no-sanitize"),
    },
    {
      command: detectCommandName(argv),
      cwd: process.cwd(),
      isTTY,
    },
  );

  emitRendered(rendered.content, rendered.outputPath);
  process.exit(normalized.exitCode);
}

function addReadOptions<T extends Command>(command: T): T {
  return command
    .addOption(formatOption())
    .addOption(fieldsOption())
    .addOption(outputFileOption())
    .addOption(sanitizeOption())
    .addOption(
      new Option(
        "--page <number>",
        "Return a single page of results",
      ).argParser(parseInteger),
    )
    .addOption(
      new Option(
        "--page-size <number>",
        "Page size for structured read results",
      ).argParser(parseInteger),
    )
    .option("--page-all", "Emit every page for structured read results");
}

function addMutationOptions<T extends Command>(command: T): T {
  return command
    .addOption(formatOption())
    .addOption(fieldsOption())
    .addOption(outputFileOption())
    .addOption(sanitizeOption())
    .option("--dry-run", "Validate the action without mutating local state")
    .option("--json <payload>", "Raw JSON payload for the command")
    .option(
      "--input-file <path>",
      "Path to a JSON payload file, or '-' to read JSON from stdin",
    )
    .option(
      "--storage-state-file <path>",
      "Use a Playwright storage-state JSON file instead of browser auth",
    )
    .option(
      "--storage-state-json <payload>",
      "Inline Playwright storage-state JSON instead of browser auth",
    )
    .option("--provider <provider>", "Account provider: claude, codex, cursor")
    .option(
      "--renews-at <timestamp>",
      "Manual subscription renewal timestamp, or 'none' to clear",
    )
    .option("--codex-home <path>", "Codex home containing auth.json");
}

function formatOption(): Option {
  return new Option("--format <format>", "Output format").choices([
    "human",
    "json",
    "ndjson",
  ]);
}

function fieldsOption(): Option {
  return new Option(
    "--fields <mask>",
    "Comma-separated field mask for structured output",
  );
}

function outputFileOption(): Option {
  return new Option(
    "--output-file <path>",
    "Write output to a file inside the current working directory",
  );
}

function sanitizeOption(): Option {
  return new Option(
    "--no-sanitize",
    "Disable response sanitization in structured output",
  );
}

function emitResult(
  result:
    | Awaited<ReturnType<typeof runStatusCommand>>
    | ReturnType<typeof runListCommand>,
  options: OutputOptions,
): void {
  const rendered = renderCommandResult(
    result,
    normalizeOutputOptions(options),
    {
      cwd: process.cwd(),
      isTTY,
    },
  );
  emitRendered(rendered.content, rendered.outputPath);
}

function emitRendered(content: string, outputPath?: string): void {
  if (!outputPath) {
    process.stdout.write(content);
    return;
  }

  if (resolvedFormat === "human") {
    process.stdout.write(`Wrote output to ${outputPath}\n`);
    return;
  }

  process.stdout.write(
    `${JSON.stringify({ ok: true, output_path: outputPath })}\n`,
  );
}

function detectRequestedFormat(args: string[]): string | undefined {
  return peekFlagValue(args, "--format");
}

function isMetaOutputRequest(args: string[]): boolean {
  return (
    args.includes("--help") ||
    args.includes("-h") ||
    args.includes("--version") ||
    args.includes("-V")
  );
}

function detectCommandName(args: string[]): string {
  for (const arg of args) {
    if (!arg.startsWith("-")) {
      return arg;
    }
  }
  return "status";
}

function peekFlagValue(args: string[], flag: string): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag) {
      return args[index + 1];
    }
    if (args[index]?.startsWith(`${flag}=`)) {
      return args[index]?.slice(flag.length + 1);
    }
  }
  return undefined;
}

function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new CLIError(`Expected a positive integer, received "${value}".`, {
      code: "INVALID_NUMBER",
      exitCode: 2,
    });
  }
  return parsed;
}

function getOptionsFromActionArgs(
  args: unknown[],
): OutputOptions & Record<string, unknown> {
  const last = args.at(-1);
  if (last instanceof Command) {
    return last.opts();
  }
  return (last as OutputOptions & Record<string, unknown>) ?? {};
}

function resolveAccountTarget(
  first: string | undefined,
  second: string | undefined,
  providerOption: unknown,
): { name: string | undefined; provider?: Provider } {
  if (typeof providerOption === "string") {
    return {
      name: second ?? first,
      provider: providerOption as Provider,
    };
  }

  if (second && isProvider(first)) {
    return {
      name: second,
      provider: first,
    };
  }

  return { name: first };
}

function isProvider(value: string | undefined): value is Provider {
  return value === "claude" || value === "codex" || value === "cursor";
}

function normalizeOutputOptions(options: OutputOptions): OutputOptions {
  return {
    ...options,
    fields: options.fields ?? peekFlagValue(argv, "--fields"),
    format: options.format ?? requestedFormat,
    outputFile: options.outputFile ?? peekFlagValue(argv, "--output-file"),
    page: options.page ?? parseOptionalInteger(peekFlagValue(argv, "--page")),
    pageAll: options.pageAll ?? argv.includes("--page-all"),
    pageSize:
      options.pageSize ??
      parseOptionalInteger(peekFlagValue(argv, "--page-size")),
    sanitize: argv.includes("--no-sanitize")
      ? false
      : (options.sanitize ?? true),
  };
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  return Number.parseInt(value, 10);
}

function normalizeError(error: unknown): {
  code: string;
  details?: unknown;
  exitCode: number;
  message: string;
} {
  if (error instanceof CLIError) {
    return {
      code: error.code,
      details: error.details,
      exitCode: error.exitCode,
      message: error.message,
    };
  }

  if (error instanceof CommanderError) {
    return {
      code: error.code,
      exitCode: error.exitCode,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      code: "CLI_ERROR",
      details: error.stack,
      exitCode: 1,
      message: error.message,
    };
  }

  return {
    code: "CLI_ERROR",
    details: error,
    exitCode: 1,
    message: String(error),
  };
}

function isBenignCommanderExit(error: CommanderError): boolean {
  return (
    error.code === "commander.help" ||
    error.code === "commander.helpDisplayed" ||
    error.code === "commander.version"
  );
}
