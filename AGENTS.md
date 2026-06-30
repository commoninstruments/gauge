# Gauge - Agent Instructions

## Communication Expectations
- Treat this CLI as agent-first and report the exact command form used.
- Explain before running mutating commands, even in dry-run mode.
- Prefer structured output in summaries so downstream agents can act on it.

## How To Work In This Codebase
- Start by running or inspecting `gauge describe --format json` before invoking the CLI programmatically.
- Prefer `--format json` or `--format ndjson`; non-TTY mode defaults to structured JSON.
- Use `--fields` on read commands unless the full payload is truly needed.
- Use `--json` or `--input-file -` for mutating payloads.

## Editing Constraints
- Use `--dry-run` on mutating commands before real invocation.
- Keep output paths inside the current working directory.
- Keep structured output sanitized by default; only use `--no-sanitize` for trusted downstream consumers.
- Do not weaken schema discovery, exit codes, or JSON behavior to make human output prettier.

## Search Preferences
- Search CLI command definitions and tests before changing command contracts.
- Search README or generated command descriptions before writing usage examples.
- For ambiguous CLI behavior, prefer executable descriptions over prose.

## Commands
- `pnpm dev` - run the CLI from TypeScript.
- `pnpm build` - compile and insert shebang.
- `pnpm test` - Node test runner.
- `pnpm typecheck` - TypeScript check.
- `pnpm lint` / `pnpm format` - existing shared lint and format scripts.

## Repo-Specific Rules
- Preferred sequence: `gauge describe --format json`, read command with `--fields`, mutating command with `--dry-run`, then real mutating command.
- Prefer headless auth via `storage_state_file`, `storage_state_json`, `GAUGE_STORAGE_STATE_FILE`, or `GAUGE_STORAGE_STATE_JSON`.
- Arc can help plan larger CLI changes; Mastra does not belong in this CLI unless the product direction changes.
