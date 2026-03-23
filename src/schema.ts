import { findChrome } from "./chrome.js";

interface CommandSchema {
  command: string;
  examples: string[];
  kind: "read" | "mutating";
  raw_payload: {
    accepts_json_option: boolean;
    accepts_stdin: boolean;
    schema: Record<string, unknown>;
  };
  response: {
    paginated: boolean;
    supports_fields: boolean;
    supports_ndjson: boolean;
  };
  safety: {
    dry_run: boolean;
    sanitizes_remote_strings: boolean;
  };
  summary: string;
}

const GLOBAL_OPTIONS = {
  format: {
    type: "string",
    enum: ["human", "json", "ndjson"],
    default_non_tty: "json",
  },
  fields: {
    type: "string",
    description: "Comma-separated field mask applied to structured output.",
  },
  output_file: {
    type: "string",
    description:
      "Optional output file path. Must remain inside the current working directory.",
  },
  sanitize: {
    type: "boolean",
    default: true,
  },
};

const COMMAND_SCHEMAS: CommandSchema[] = [
  {
    command: "status",
    kind: "read",
    summary:
      "Fetch Claude usage for all configured accounts and recommend the next account.",
    examples: [
      "claudeusage status --format json --fields recommendation.account.name,accounts.name",
      "claudeusage --quick --format json",
      "claudeusage status --format ndjson --page-size 1 --page-all",
    ],
    raw_payload: {
      accepts_json_option: false,
      accepts_stdin: false,
      schema: {},
    },
    response: {
      paginated: true,
      supports_fields: true,
      supports_ndjson: true,
    },
    safety: {
      dry_run: false,
      sanitizes_remote_strings: true,
    },
  },
  {
    command: "list",
    kind: "read",
    summary: "List configured accounts and local auth artifacts.",
    examples: [
      "claudeusage list --format json",
      "claudeusage list --format ndjson --page-size 10 --page-all",
    ],
    raw_payload: {
      accepts_json_option: false,
      accepts_stdin: false,
      schema: {},
    },
    response: {
      paginated: true,
      supports_fields: true,
      supports_ndjson: true,
    },
    safety: {
      dry_run: false,
      sanitizes_remote_strings: true,
    },
  },
  {
    command: "describe",
    kind: "read",
    summary: "Introspect the runtime command schemas and agent guardrails.",
    examples: [
      "claudeusage describe --format json",
      "claudeusage describe add --fields commands.command,commands.raw_payload.schema",
    ],
    raw_payload: {
      accepts_json_option: false,
      accepts_stdin: false,
      schema: {},
    },
    response: {
      paginated: false,
      supports_fields: true,
      supports_ndjson: true,
    },
    safety: {
      dry_run: false,
      sanitizes_remote_strings: true,
    },
  },
  {
    command: "add",
    kind: "mutating",
    summary:
      "Add an account via browser auth or headless storage-state import.",
    examples: [
      "claudeusage add personal --dry-run",
      'claudeusage add --json \'{"name":"personal","storage_state_file":"./state.json"}\' --format json',
    ],
    raw_payload: {
      accepts_json_option: true,
      accepts_stdin: true,
      schema: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          storage_state_json: { type: "string" },
          storage_state_file: { type: "string" },
        },
      },
    },
    response: {
      paginated: false,
      supports_fields: true,
      supports_ndjson: true,
    },
    safety: {
      dry_run: true,
      sanitizes_remote_strings: true,
    },
  },
  {
    command: "refresh",
    kind: "mutating",
    summary:
      "Refresh an account session via browser auth or headless storage-state import.",
    examples: [
      "claudeusage refresh personal --dry-run",
      'printf \'{"name":"personal","storage_state_json":{...}}\' | claudeusage refresh --input-file - --format json',
    ],
    raw_payload: {
      accepts_json_option: true,
      accepts_stdin: true,
      schema: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          storage_state_json: { type: "string" },
          storage_state_file: { type: "string" },
        },
      },
    },
    response: {
      paginated: false,
      supports_fields: true,
      supports_ndjson: true,
    },
    safety: {
      dry_run: true,
      sanitizes_remote_strings: true,
    },
  },
  {
    command: "remove",
    kind: "mutating",
    summary: "Remove an account and all local auth artifacts.",
    examples: [
      "claudeusage remove personal --dry-run",
      'claudeusage remove --json \'{"name":"personal"}\' --format json',
    ],
    raw_payload: {
      accepts_json_option: true,
      accepts_stdin: true,
      schema: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
        },
      },
    },
    response: {
      paginated: false,
      supports_fields: true,
      supports_ndjson: true,
    },
    safety: {
      dry_run: true,
      sanitizes_remote_strings: true,
    },
  },
];

export function describeCommands(
  commandName?: string
): Record<string, unknown> {
  const commands = commandName
    ? COMMAND_SCHEMAS.filter((command) => command.command === commandName)
    : COMMAND_SCHEMAS;

  return {
    generated_at: new Date().toISOString(),
    security_posture:
      "The agent is not a trusted operator. Use --dry-run for mutating commands, use --fields on reads, and keep output paths inside the current working directory.",
    runtime: {
      chrome_installed: findChrome() !== null,
      non_tty_default_format: "json",
      headless_auth: true,
      supported_surfaces: ["binary", "json", "ndjson"],
    },
    global_options: GLOBAL_OPTIONS,
    commands,
  };
}
